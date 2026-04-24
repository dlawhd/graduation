// src/pages/JarChatPanel.jsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getChatMessages,
  getChatUnreadCount,
  getNewChatMessages,
  markChatAsRead,
  sendChatMessage,
} from "../api/chatApi";

/*
 * JarChatPanel 역할
 *
 * 저금통 상세 화면 안에서 보여줄 채팅 패널이야.
 *
 * 쉽게 말하면:
 * - 처음 들어오면 기존 채팅 목록을 불러오고
 * - 메시지를 보낼 수 있고
 * - 3초마다 새 메시지를 확인하고
 * - 마지막으로 본 메시지를 읽음 처리하고
 * - unreadCount도 보여줘.
 *
 * 지금은 WebSocket이 아니라 Polling 방식이야.
 * Polling은 "몇 초마다 서버에 새 메시지 있어?"라고 물어보는 방식이야.
 */

// 처음 가져올 메시지 개수
const DEFAULT_LIMIT = 30;

// 새 메시지 확인 주기
// 3000ms = 3초
const POLLING_INTERVAL_MS = 3000;

/*
 * 채팅 시간을 화면에 보기 좋게 바꾸는 함수
 */
function formatChatTime(value) {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/*
 * 메시지 배열을 안전하게 정리하는 함수
 *
 * 서버가 혹시 items를 안 내려줘도 화면이 터지지 않게 해준다.
 */
function normalizeMessageItems(payload) {
  if (!payload) return [];

  if (Array.isArray(payload)) {
    return payload;
  }

  if (Array.isArray(payload.items)) {
    return payload.items;
  }

  return [];
}

/*
 * 메시지 목록에서 가장 마지막 messageId 찾기
 *
 * Polling에서 afterMessageId로 사용한다.
 */
function getLastMessageId(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return null;
  }

  return messages[messages.length - 1]?.messageId ?? null;
}

/*
 * 메시지 목록에서 중복 messageId를 제거해서 합치는 함수
 *
 * 왜 필요하냐면?
 * - Polling 중에 같은 메시지가 다시 들어올 수도 있고
 * - 이전 메시지 더 보기와 기존 목록이 겹칠 수도 있어.
 *
 * messageId 기준으로 중복을 제거한다.
 */
function mergeUniqueMessages(oldMessages, newMessages) {
  const map = new Map();

  [...oldMessages, ...newMessages].forEach((message) => {
    if (!message?.messageId) return;
    map.set(message.messageId, message);
  });

  return Array.from(map.values()).sort((a, b) => a.messageId - b.messageId);
}

/*
 * 채팅 내용 입력값이 "공백만 있는지" 확인하는 함수
 *
 * 주의:
 * - 실제로 서버에 보낼 때는 trim한 값을 보내지 않는다.
 * - 사용자가 입력한 원본 content를 그대로 보낸다.
 * - 이 함수는 전송 가능 여부만 판단한다.
 */
function isBlankMessage(value) {
  return typeof value !== "string" || value.trim().length === 0;
}

export default function JarChatPanel({ jarId }) {
  // 채팅 메시지 목록
  const [messages, setMessages] = useState([]);

  // 처음 메시지 불러오는 중인지
  const [loading, setLoading] = useState(false);

  // 이전 메시지 더 불러오는 중인지
  const [loadingMore, setLoadingMore] = useState(false);

  // 메시지 보내는 중인지
  const [sending, setSending] = useState(false);

  // 에러 문구
  const [error, setError] = useState("");

  // 입력창 값
  const [draft, setDraft] = useState("");

  // 이전 메시지가 더 있는지
  const [hasNext, setHasNext] = useState(false);

  // 이전 메시지 더 보기용 커서
  const [nextBeforeMessageId, setNextBeforeMessageId] = useState(null);

  // 안 읽은 메시지 개수
  const [unreadCount, setUnreadCount] = useState(0);

  // 채팅 메시지 영역 DOM 참조
  const scrollBoxRef = useRef(null);

  // Polling에서 최신 messageId를 안정적으로 쓰기 위한 ref
  const lastMessageIdRef = useRef(null);

  // 이전 메시지 더 보기 중에는 아래로 자동 스크롤하면 안 되므로 구분용 ref
  const shouldScrollToBottomRef = useRef(true);

  /*
   * 마지막 messageId ref 갱신
   *
   * messages가 바뀔 때마다 마지막 메시지 ID를 저장해둔다.
   * setInterval 안에서는 state가 오래된 값으로 잡힐 수 있어서 ref를 같이 쓴다.
   */
  useEffect(() => {
    lastMessageIdRef.current = getLastMessageId(messages);
  }, [messages]);

  /*
   * 채팅창 맨 아래로 이동
   */
  const scrollToBottom = useCallback(() => {
    const box = scrollBoxRef.current;

    if (!box) return;

    box.scrollTop = box.scrollHeight;
  }, []);

  /*
   * 메시지가 바뀌면 필요할 때만 아래로 이동
   *
   * - 처음 조회
   * - 새 메시지 도착
   * - 내가 메시지 보냄
   *
   * 이런 경우에는 아래로 이동하는 게 자연스러워.
   *
   * 하지만 "이전 메시지 더 보기"는 위쪽에 메시지를 붙이는 거라
   * 아래로 이동하면 사용자가 보던 위치가 튀어버려.
   */
  useEffect(() => {
    if (!shouldScrollToBottomRef.current) {
      shouldScrollToBottomRef.current = true;
      return;
    }

    window.requestAnimationFrame(scrollToBottom);
  }, [messages, scrollToBottom]);

  /*
   * unread count 불러오기
   */
  const loadUnreadCount = useCallback(async () => {
    if (!jarId) return;

    try {
      const data = await getChatUnreadCount(jarId);
      setUnreadCount(Number(data?.unreadCount || 0));
    } catch (e) {
      // unread는 화면 핵심 기능은 아니므로 실패해도 조용히 0으로 둔다.
      setUnreadCount(0);
    }
  }, [jarId]);

  /*
   * 마지막 메시지까지 읽음 처리
   */
  const markLatestMessageAsRead = useCallback(
    async (targetMessages) => {
      if (!jarId) return;

      const lastMessageId = getLastMessageId(targetMessages);

      if (!lastMessageId) return;

      try {
        await markChatAsRead(jarId, lastMessageId);
        await loadUnreadCount();
      } catch (e) {
        // 읽음 처리가 실패해도 채팅 화면 자체는 유지한다.
      }
    },
    [jarId, loadUnreadCount]
  );

  /*
   * 처음 채팅 목록 불러오기
   */
  const loadInitialMessages = useCallback(async () => {
    if (!jarId) return;

    try {
      setLoading(true);
      setError("");

      const data = await getChatMessages(jarId, {
        limit: DEFAULT_LIMIT,
      });

      const items = normalizeMessageItems(data);

      setMessages(items);
      setHasNext(Boolean(data?.hasNext));
      setNextBeforeMessageId(data?.nextBeforeMessageId ?? null);

      await markLatestMessageAsRead(items);
      await loadUnreadCount();
    } catch (e) {
      const serverMessage =
        e?.response?.data?.error?.message ||
        e?.response?.data?.message ||
        e?.message ||
        "채팅을 불러오지 못했어요.";

      setError(serverMessage);
      setMessages([]);
      setHasNext(false);
      setNextBeforeMessageId(null);
    } finally {
      setLoading(false);
    }
  }, [jarId, loadUnreadCount, markLatestMessageAsRead]);

  /*
   * jarId가 바뀌면 채팅 목록 새로 불러오기
   */
  useEffect(() => {
    setMessages([]);
    setDraft("");
    setError("");
    setUnreadCount(0);
    setHasNext(false);
    setNextBeforeMessageId(null);

    loadInitialMessages();
  }, [jarId, loadInitialMessages]);

  /*
   * 이전 메시지 더 보기
   */
  const handleLoadMore = async () => {
    if (!jarId || !hasNext || !nextBeforeMessageId || loadingMore) return;

    try {
      setLoadingMore(true);
      setError("");

      // 이전 메시지를 붙일 때는 화면을 아래로 자동 이동하지 않는다.
      shouldScrollToBottomRef.current = false;

      const data = await getChatMessages(jarId, {
        beforeMessageId: nextBeforeMessageId,
        limit: DEFAULT_LIMIT,
      });

      const olderItems = normalizeMessageItems(data);

      setMessages((prev) => mergeUniqueMessages(olderItems, prev));
      setHasNext(Boolean(data?.hasNext));
      setNextBeforeMessageId(data?.nextBeforeMessageId ?? null);
    } catch (e) {
      const serverMessage =
        e?.response?.data?.error?.message ||
        e?.response?.data?.message ||
        e?.message ||
        "이전 채팅을 불러오지 못했어요.";

      setError(serverMessage);
    } finally {
      setLoadingMore(false);
    }
  };

  /*
   * 메시지 보내기
   */
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!jarId || sending) return;

    // 공백만 있는 메시지는 화면에서 먼저 막는다.
    // 단, 실제 보낼 때는 originalContent를 그대로 보낸다.
    if (isBlankMessage(draft)) {
      setError("채팅 내용을 입력해 주세요.");
      return;
    }

    const originalContent = draft;

    try {
      setSending(true);
      setError("");

      // 입력창은 먼저 비워서 사용자가 답답하지 않게 한다.
      setDraft("");

      const savedMessage = await sendChatMessage(jarId, originalContent);

      shouldScrollToBottomRef.current = true;

      setMessages((prev) => mergeUniqueMessages(prev, [savedMessage]));

      await markLatestMessageAsRead([...messages, savedMessage]);
      await loadUnreadCount();
    } catch (e) {
      const serverMessage =
        e?.response?.data?.error?.message ||
        e?.response?.data?.message ||
        e?.message ||
        "채팅을 보내지 못했어요.";

      setError(serverMessage);

      // 실패하면 사용자가 다시 보낼 수 있도록 입력값을 복구한다.
      setDraft(originalContent);
    } finally {
      setSending(false);
    }
  };

  /*
   * Polling으로 새 메시지 확인
   *
   * jarId가 있으면 3초마다 새 메시지를 확인한다.
   */
  useEffect(() => {
    if (!jarId) return;

    let stopped = false;

    async function pollNewMessages() {
      const afterMessageId = lastMessageIdRef.current;

      // 아직 메시지가 하나도 없으면 initial load가 담당한다.
      if (!afterMessageId) return;

      try {
        const data = await getNewChatMessages(jarId, {
          afterMessageId,
          limit: DEFAULT_LIMIT,
        });

        if (stopped) return;

        const newItems = normalizeMessageItems(data);

        if (newItems.length === 0) {
          return;
        }

        shouldScrollToBottomRef.current = true;

        setMessages((prev) => {
          const merged = mergeUniqueMessages(prev, newItems);

          // 화면에 새 메시지를 받은 시점에 마지막 메시지까지 읽음 처리한다.
          markLatestMessageAsRead(merged);

          return merged;
        });
      } catch (e) {
        // Polling 실패는 화면을 깨지 않도록 조용히 둔다.
        // 필요하면 나중에 작은 상태 표시만 추가하면 된다.
      }
    }

    const timerId = window.setInterval(pollNewMessages, POLLING_INTERVAL_MS);

    return () => {
      stopped = true;
      window.clearInterval(timerId);
    };
  }, [jarId, markLatestMessageAsRead]);

  /*
   * 전송 버튼 활성화 여부
   */
  const canSend = useMemo(() => {
    return !sending && !isBlankMessage(draft);
  }, [draft, sending]);

  return (
    <section className="rounded-[32px] border border-emerald-100 bg-white/90 p-5 shadow-sm">
      {/* 상단 제목 영역 */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.25em] text-emerald-500">
            Jar Chat
          </p>
          <h2 className="mt-1 text-2xl font-black text-slate-900">
            저금통 채팅
          </h2>
          <p className="mt-1 text-sm font-semibold text-slate-500">
            지금은 Polling 방식으로 새 메시지를 확인하고 있어요.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <span className="rounded-full bg-rose-500 px-3 py-1 text-xs font-black text-white">
              안 읽음 {unreadCount}
            </span>
          )}

          <button
            type="button"
            onClick={loadInitialMessages}
            disabled={loading}
            className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            새로고침
          </button>
        </div>
      </div>

      {/* 에러 표시 */}
      {error && (
        <div className="mb-4 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-600">
          {error}
        </div>
      )}

      {/* 채팅 메시지 영역 */}
      <div
        ref={scrollBoxRef}
        className="h-[360px] overflow-y-auto rounded-[28px] border border-slate-100 bg-slate-50/70 p-4"
      >
        {/* 이전 메시지 더 보기 */}
        {hasNext && (
          <div className="mb-4 flex justify-center">
            <button
              type="button"
              onClick={handleLoadMore}
              disabled={loadingMore}
              className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-500 shadow-sm transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loadingMore ? "불러오는 중..." : "이전 채팅 더 보기"}
            </button>
          </div>
        )}

        {loading && (
          <div className="space-y-3">
            {[1, 2, 3].map((item) => (
              <div
                key={item}
                className="h-14 animate-pulse rounded-3xl bg-white"
              />
            ))}
          </div>
        )}

        {!loading && messages.length === 0 && (
          <div className="flex h-full items-center justify-center text-center">
            <div>
              <p className="text-lg font-black text-slate-700">
                아직 채팅이 없어요.
              </p>
              <p className="mt-2 text-sm font-semibold text-slate-400">
                첫 메시지를 남겨보세요.
              </p>
            </div>
          </div>
        )}

        {!loading && messages.length > 0 && (
          <div className="space-y-3">
            {messages.map((message) => {
              const isMine = Boolean(message.mine);
              const isSystem = message.type === "SYSTEM";

              if (isSystem) {
                return (
                  <div
                    key={message.messageId}
                    className="flex justify-center"
                  >
                    <div className="rounded-full bg-slate-200 px-4 py-2 text-xs font-bold text-slate-500">
                      {message.content}
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={message.messageId}
                  className={`flex ${isMine ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[78%] rounded-[24px] px-4 py-3 shadow-sm ${
                      isMine
                        ? "rounded-br-md bg-emerald-500 text-white"
                        : "rounded-bl-md bg-white text-slate-800"
                    }`}
                  >
                    {!isMine && (
                      <p className="mb-1 text-xs font-black text-emerald-600">
                        {message.senderName || "알 수 없음"}
                      </p>
                    )}

                    <p className="whitespace-pre-wrap break-words text-sm font-semibold leading-relaxed">
                      {message.content}
                    </p>

                    <p
                      className={`mt-2 text-right text-[11px] font-semibold ${
                        isMine ? "text-emerald-50/90" : "text-slate-400"
                      }`}
                    >
                      {formatChatTime(message.createdAt)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 입력창 */}
      <form onSubmit={handleSubmit} className="mt-4 flex gap-3">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="채팅을 입력해 주세요."
          disabled={sending}
          className="min-w-0 flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 outline-none transition placeholder:text-slate-300 focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
        />

        <button
          type="submit"
          disabled={!canSend}
          className="rounded-2xl bg-emerald-500 px-5 py-3 text-sm font-black text-white shadow-md transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {sending ? "전송 중" : "전송"}
        </button>
      </form>
    </section>
  );
}