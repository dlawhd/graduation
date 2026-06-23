// src/pages/JarChatPanel.jsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getChatMessages,
  getChatUnreadCount,
  getNewChatMessages,
  markChatAsRead,
  sendChatMessage,
} from "../api/chatApi";
import {
  createChatSocketClient,
  disconnectChatSocket,
  sendChatSocketMessage,
} from "../api/chatSocketApi";

/*
 * JarChatPanel 역할
 *
 * 저금통 상세 화면 안에서 보여줄 채팅 패널이야.
 *
 * 쉽게 말하면:
 * - 처음 들어오면 REST API로 기존 채팅 목록을 불러오고
 * - WebSocket으로 새 메시지를 실시간으로 받고
 * - 메시지를 보낼 때 WebSocket으로 전송하고
 * - WebSocket 연결이 실패하면 기존 Polling 방식으로 새 메시지를 확인하고
 * - 마지막으로 본 메시지를 읽음 처리하고
 * - unreadCount도 보여줘.
 *
 * 핵심:
 * - 기존 메시지 조회는 REST
 * - 새 메시지 실시간 수신은 WebSocket
 * - WebSocket 실패 시 Polling fallback
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
 * 첫 번째 안 읽은 메시지가 현재 화면에 있는지 확인한다.
 *
 * 서버가 firstUnreadMessageId를 내려줘도
 * 현재 messages 안에 해당 메시지가 없으면 바로 스크롤할 수 없다.
 */
function hasMessageById(messages, messageId) {
  if (!messageId) return false;

  return messages.some((message) => Number(message.messageId) === Number(messageId));
}

/*
 * WebSocket으로 받은 메시지를 화면에서 쓰기 좋은 모양으로 바꿔주는 함수
 *
 * WebSocket 응답에는 mine 값이 없을 수 있다.
 * 그래서 senderId와 현재 로그인한 사용자 ID를 비교해서
 * "내가 보낸 메시지인지"를 프론트에서 계산한다.
 */
function normalizeSocketMessage(message, currentUserId) {
  if (!message) return null;

  return {
    ...message,

    // 내가 보낸 메시지면 오른쪽에 보여주기 위해 true로 만든다.
    mine:
      currentUserId != null &&
      Number(message.senderId) === Number(currentUserId),
  };
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

export default function JarChatPanel({ jarId, currentUserId }) {
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

  // WebSocket 연결 성공 여부
  // true면 WebSocket으로 새 메시지를 받고,
  // false면 기존 Polling 방식으로 새 메시지를 확인한다.
  const [webSocketConnected, setWebSocketConnected] = useState(false);

  // STOMP 클라이언트를 저장하는 ref
  // ref를 쓰는 이유:
  // 화면이 다시 렌더링돼도 WebSocket 연결 객체를 유지하기 위해서다.
  const socketClientRef = useRef(null);

  // 이전 메시지가 더 있는지
  const [hasNext, setHasNext] = useState(false);

  // 이전 메시지 더 보기용 커서
  const [nextBeforeMessageId, setNextBeforeMessageId] = useState(null);

  // 이후 메시지가 더 있는지
  // 첫 안 읽은 메시지부터 30개만 가져온 경우,
  // 그 뒤에 이어지는 메시지가 더 있을 수 있다.
  const [hasNewer, setHasNewer] = useState(false);

  // 이후 메시지 더 불러오는 중인지
  const [loadingNewer, setLoadingNewer] = useState(false);

  // 안 읽은 메시지 개수
  const [unreadCount, setUnreadCount] = useState(0);

  // 첫 번째 안 읽은 메시지 ID
  // 채팅방을 처음 열 때 이 메시지 위치로 이동하기 위해 사용한다.
  const [firstUnreadMessageId, setFirstUnreadMessageId] = useState(null);

  // 아직 서버에 읽음 처리하지 않은 메시지 ID
  // 먼저 첫 번째 안 읽은 메시지를 보여준 뒤, 화면 이동이 끝나면 읽음 처리한다.
  const pendingReadMessageIdRef = useRef(null);

  // 첫 번째 안 읽은 메시지 위치로 이미 이동했는지 기억한다.
  // 새 메시지가 올 때마다 계속 첫 안 읽은 메시지로 튀는 것을 막기 위해 사용한다.
  const unreadInitialScrollDoneRef = useRef(false);

  // messageId별 DOM을 저장하는 ref
  // 특정 메시지 위치로 스크롤하기 위해 사용한다.
  const messageElementRefs = useRef({});

  // 채팅 메시지 영역 DOM 참조
  const scrollBoxRef = useRef(null);

  // Polling에서 최신 messageId를 안정적으로 쓰기 위한 ref
  const lastMessageIdRef = useRef(null);

  // 이전 메시지 더 보기 중에는 아래로 자동 스크롤하면 안 되므로 구분용 ref
  const shouldScrollToBottomRef = useRef(true);

  // 더보기로 메시지를 붙인 뒤 이동해야 할 메시지 ID
  // 예: 30번 아래에 31~60번을 붙이면, 맨 아래 60번이 아니라 31번으로 이동해야 한다.
  const pendingScrollMessageIdRef = useRef(null);

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
   * 특정 메시지 위치로 이동
   *
   * 첫 번째 안 읽은 메시지 ID가 있으면
   * 채팅방을 열 때 그 메시지를 기준으로 화면을 보여준다.
   */
  const scrollToMessage = useCallback((messageId, block = "center") => {
    const target = messageElementRefs.current[messageId];

    if (!target) {
      scrollToBottom();
      return;
    }

    target.scrollIntoView({
      behavior: "auto",

      // center: 첫 안 읽은 메시지를 화면 가운데에 보여줄 때 사용
      // start: 더보기 후 바로 다음 메시지부터 이어서 보여줄 때 사용
      block,
    });
  }, [scrollToBottom]);

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
    // 로딩 중에는 아직 메시지 DOM이 없을 수 있으므로 스크롤하지 않는다.
    if (loading) return;

    /*
     * 이후 채팅 더 보기로 새 메시지를 붙인 직후에는
     * 맨 아래로 보내지 않고, 새로 붙은 첫 메시지 위치로 이동한다.
     *
     * 예:
     * 현재 화면에 1~30번이 있음
     * 이후 채팅 더 보기 클릭
     * 31~60번이 새로 붙음
     *
     * 이때 60번으로 가면 안 되고,
     * 사용자가 이어서 읽을 수 있게 31번으로 이동해야 한다.
     */
    const pendingScrollMessageId = pendingScrollMessageIdRef.current;

    if (
      pendingScrollMessageId &&
      hasMessageById(messages, pendingScrollMessageId)
    ) {
      // 한 번 이동했으면 같은 위치로 또 이동하지 않도록 비운다.
      pendingScrollMessageIdRef.current = null;

      // 다음 새 메시지나 전송 메시지에서는 다시 아래 이동이 가능하도록 복구한다.
      shouldScrollToBottomRef.current = true;

      // 메시지 DOM이 화면에 그려진 다음 31번 위치로 이동한다.
      window.requestAnimationFrame(() => {
        scrollToMessage(pendingScrollMessageId, "start");
      });

      return;
    }

    /*
     * 이전 메시지 더 보기처럼 스크롤을 유지해야 하는 상황이면
     * 여기서 아래 이동을 막고 끝낸다.
     */
    if (!shouldScrollToBottomRef.current) {
      shouldScrollToBottomRef.current = true;
      return;
    }

    /*
     * 첫 번째 안 읽은 메시지가 있으면 그 메시지 위치로 먼저 이동한다.
     *
     * 기존에는 채팅방을 열자마자 항상 맨 아래로 이동했지만,
     * 이제는 안 읽은 메시지가 있으면 첫 안 읽은 메시지를 기준으로 보여준다.
     */
    if (
      firstUnreadMessageId &&
      !unreadInitialScrollDoneRef.current &&
      hasMessageById(messages, firstUnreadMessageId)
    ) {
      unreadInitialScrollDoneRef.current = true;

      window.requestAnimationFrame(() => {
        scrollToMessage(firstUnreadMessageId);
      });
      return;
    }

    // 일반 새 메시지, 내가 보낸 메시지는 맨 아래로 이동한다.
    window.requestAnimationFrame(scrollToBottom);
  }, [messages, firstUnreadMessageId, loading, scrollToBottom, scrollToMessage]);

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
   * 첫 번째 안 읽은 메시지 위치로 이동한 뒤 읽음 처리
   *
   * 순서가 중요하다.
   * 1. 먼저 첫 번째 안 읽은 메시지 위치로 화면을 보여준다.
   * 2. 그 다음 현재 불러온 마지막 메시지까지 읽음 처리한다.
   */
  useEffect(() => {
    if (loading) return;
    if (!jarId || !firstUnreadMessageId) return;
    if (!hasMessageById(messages, firstUnreadMessageId)) return;

    const targetReadMessageId = pendingReadMessageIdRef.current;

    if (!targetReadMessageId) return;

    pendingReadMessageIdRef.current = null;

    window.requestAnimationFrame(() => {
      markChatAsRead(jarId, targetReadMessageId)
        .then(loadUnreadCount)
        .catch(() => {
          // 읽음 처리 실패해도 채팅 화면 자체는 유지한다.
        });
    });
  }, [jarId, messages, firstUnreadMessageId, loading, loadUnreadCount]);

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

      const firstUnreadId = data?.firstUnreadMessageId ?? null;
      const lastMessageId = getLastMessageId(items);

      setMessages(items);
      setHasNext(Boolean(data?.hasNext));
      setNextBeforeMessageId(data?.nextBeforeMessageId ?? null);
      setFirstUnreadMessageId(firstUnreadId);

      /*
       * 첫 번째 안 읽은 메시지부터 가져왔는데
       * 가져온 개수가 DEFAULT_LIMIT와 같으면
       * 뒤에 이어지는 메시지가 더 있을 수 있다.
       *
       * 예:
       * - 안 읽은 메시지 58개
       * - 처음 30개만 조회
       * - 나머지 28개를 아래쪽에서 더 불러와야 함
       */
      setHasNewer(Boolean(firstUnreadId) && items.length >= DEFAULT_LIMIT);

      /*
       * 안 읽은 메시지가 있으면 바로 맨 아래로 보내지 않는다.
       * 먼저 첫 번째 안 읽은 메시지 위치로 이동하게 둔다.
       */
      if (firstUnreadId && hasMessageById(items, firstUnreadId)) {
        shouldScrollToBottomRef.current = true;
        unreadInitialScrollDoneRef.current = false;
        pendingReadMessageIdRef.current = lastMessageId;
      } else {
        shouldScrollToBottomRef.current = true;
        await markLatestMessageAsRead(items);
      }

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
   *
   * 다른 저금통 채팅방으로 이동할 때
   * 이전 저금통의 메시지, unread 표시, 스크롤 위치 정보가 남아 있으면 안 된다.
   *
   * 그래서 jarId가 바뀔 때마다 채팅 관련 상태를 깨끗하게 초기화한 뒤
   * 새 저금통의 채팅 목록을 다시 불러온다.
   */
  useEffect(() => {
    // 이전 저금통의 채팅 메시지를 비운다.
    setMessages([]);

    // 입력창에 남아 있던 글을 비운다.
    setDraft("");

    // 이전 에러 메시지를 비운다.
    setError("");

    // 안 읽은 메시지 개수를 초기화한다.
    setUnreadCount(0);

    // 첫 번째 안 읽은 메시지 표시를 초기화한다.
    setFirstUnreadMessageId(null);

    // 아직 읽음 처리 대기 중이던 메시지 ID를 초기화한다.
    pendingReadMessageIdRef.current = null;

    // 첫 안 읽은 메시지로 이동했는지 여부를 초기화한다.
    unreadInitialScrollDoneRef.current = false;

    // 이전 채팅방의 메시지 DOM 위치 정보를 비운다.
    messageElementRefs.current = {};

    // 이전 메시지 더 보기 상태를 초기화한다.
    setHasNext(false);

    // 이전 메시지 더 보기 커서를 초기화한다.
    setNextBeforeMessageId(null);

    // 이후 메시지 더 보기 상태를 초기화한다.
    setHasNewer(false);

    // 이후 메시지 로딩 상태를 초기화한다.
    setLoadingNewer(false);

    // 더보기 후 이동해야 했던 메시지 위치도 초기화한다.
    pendingScrollMessageIdRef.current = null;

    // 새 jarId 기준으로 채팅 목록을 다시 불러온다.
    loadInitialMessages();
  }, [jarId, loadInitialMessages]);

  /*
   * WebSocket 연결
   *
   * 채팅 모달이 열리면 JarChatPanel이 화면에 생긴다.
   * 이때 WebSocket에 연결하고,
   * 이 저금통 채팅방 topic을 구독한다.
   *
   * 중요한 점:
   * - jarId가 있어야 어떤 저금통 채팅방인지 알 수 있다.
   * - currentUserId가 있어야 내가 보낸 메시지인지 정확히 계산할 수 있다.
   *
   * 모달을 닫으면 JarChatPanel이 사라지므로
   * cleanup에서 WebSocket 연결을 끊는다.
   */
  useEffect(() => {
    // jarId가 없으면 어떤 저금통 채팅방인지 알 수 없다.
    // currentUserId가 아직 없으면 mine 계산이 틀릴 수 있어서 연결하지 않는다.
    if (!jarId || currentUserId == null) return;

    // 기존 연결이 남아 있으면 먼저 끊어준다.
    // 같은 저금통에 중복 연결되는 것을 막기 위해서다.
    if (socketClientRef.current) {
      disconnectChatSocket(socketClientRef.current);
      socketClientRef.current = null;
    }

    // 새 연결을 시작하기 전에는 일단 연결 안 된 상태로 표시한다.
    setWebSocketConnected(false);

    // STOMP WebSocket 클라이언트를 만든다.
    const client = createChatSocketClient({
      jarId,

      /*
       * 서버가 /topic/jars/{jarId}/chat 으로 메시지를 보내면 이 함수가 실행된다.
       */
      onMessageReceived: (message) => {
        // WebSocket 메시지에는 mine 값이 없으므로
        // senderId와 currentUserId를 비교해서 mine을 만든다.
        const normalizedMessage = normalizeSocketMessage(
          message,
          currentUserId
        );

        if (!normalizedMessage) return;

        // 새 메시지가 오면 채팅창을 아래로 내려야 자연스럽다.
        shouldScrollToBottomRef.current = true;

        // 새 메시지를 기존 메시지 목록에 합친다.
        // messageId 기준으로 중복 제거도 같이 한다.
        setMessages((prev) => {
          return mergeUniqueMessages(prev, [normalizedMessage]);
        });

        /*
         * 새 메시지를 화면에서 받았으니 읽음 처리한다.
         *
         * 주의:
         * setMessages 안에서는 API 호출을 하지 않는 게 안전하다.
         * 그래서 읽음 처리는 setMessages 밖에서 처리한다.
         */
        const nextReadMessageId = Math.max(
          Number(lastMessageIdRef.current || 0),
          Number(normalizedMessage.messageId || 0)
        );

        if (nextReadMessageId > 0) {
          markChatAsRead(jarId, nextReadMessageId)
            .then(loadUnreadCount)
            .catch(() => {
              // 읽음 처리 실패해도 채팅 화면은 유지한다.
            });
        }
      },

      // WebSocket 연결 성공
      onConnect: () => {
        setWebSocketConnected(true);
      },

      // WebSocket 연결 실패
      // 이 경우 기존 Polling이 fallback으로 계속 돈다.
      onError: () => {
        setWebSocketConnected(false);
      },
    });

    // 만든 STOMP 클라이언트를 ref에 저장한다.
    socketClientRef.current = client;

    // 실제 WebSocket 연결을 시작한다.
    client.activate();

    // 채팅 모달을 닫거나 jarId/currentUserId가 바뀌면 연결을 끊는다.
    return () => {
      setWebSocketConnected(false);
      disconnectChatSocket(client);

      if (socketClientRef.current === client) {
        socketClientRef.current = null;
      }
    };
  }, [jarId, currentUserId, loadUnreadCount]);

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
   * 이후 메시지 더 보기
   *
   * 첫 번째 안 읽은 메시지부터 채팅방을 열면,
   * 처음에는 DEFAULT_LIMIT 개수만 내려온다.
   *
   * 예:
   * - 안 읽은 메시지 58개
   * - 처음 30개 표시
   * - 아래로 내려가면 나머지 28개를 가져와야 함
   *
   * 이 함수는 현재 화면의 마지막 messageId 이후 메시지를 가져온다.
   */
  const handleLoadNewer = async () => {
    if (!jarId || !hasNewer || loadingNewer) return;

    const afterMessageId = lastMessageIdRef.current;

    if (!afterMessageId) {
      setHasNewer(false);
      return;
    }

    try {
      setLoadingNewer(true);
      setError("");

      const data = await getNewChatMessages(jarId, {
        afterMessageId,
        limit: DEFAULT_LIMIT,
      });

      const newerItems = normalizeMessageItems(data);

      if (newerItems.length === 0) {
        setHasNewer(false);
        return;
      }

      /*
       * 이후 메시지를 붙인 뒤에는 맨 아래로 보내면 안 된다.
       *
       * 예: 현재 1~30번을 보고 있고, 이후 메시지 31~60번을 가져왔다면
       * 사용자가 이어서 읽을 수 있게 31번 위치로 이동해야 한다.
       */
      const firstNewerMessageId = newerItems[0]?.messageId ?? null;

      if (firstNewerMessageId) {
        pendingScrollMessageIdRef.current = firstNewerMessageId;
        shouldScrollToBottomRef.current = false;
      }

      setMessages((prev) => mergeUniqueMessages(prev, newerItems));
      /*
       * 이번에도 DEFAULT_LIMIT만큼 꽉 차서 왔다면
       * 뒤에 더 있을 수 있다.
       *
       * 28개처럼 limit보다 적게 오면
       * 이제 뒤에 더 없다고 본다.
       */
      setHasNewer(newerItems.length >= DEFAULT_LIMIT);

      const newestMessageId = getLastMessageId(newerItems);

      if (newestMessageId) {
        await markChatAsRead(jarId, newestMessageId);
        await loadUnreadCount();
      }
    } catch (e) {
      const serverMessage =
        e?.response?.data?.error?.message ||
        e?.response?.data?.message ||
        e?.message ||
        "이후 채팅을 불러오지 못했어요.";

      setError(serverMessage);
    } finally {
      setLoadingNewer(false);
    }
  };


  /*
   * 메시지 보내기
   *
   * WebSocket 연결 성공 상태면:
   * - WebSocket publish로 보낸다.
   * - 화면에는 바로 추가하지 않는다.
   * - 서버가 다시 /topic 으로 뿌려준 메시지를 받을 때 화면에 추가한다.
   *
   * WebSocket 연결 실패 상태면:
   * - 기존 REST 전송을 사용한다.
   * - 이게 fallback 역할이다.
   */
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!jarId || sending) return;

    // 공백만 있는 메시지는 화면에서 먼저 막는다.
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

      /*
       * 1순위: WebSocket 전송
       *
       * 주의:
       * 여기서 setMessages로 바로 추가하지 않는다.
       * 왜냐하면 서버가 다시 WebSocket으로 보내주기 때문이다.
       *
       * 여기서 바로 추가하고,
       * WebSocket으로 받은 것도 또 추가하면
       * 같은 메시지가 2번 보일 수 있다.
       */
      if (webSocketConnected && socketClientRef.current?.connected) {
        sendChatSocketMessage({
          client: socketClientRef.current,
          jarId,
          content: originalContent,
        });

        return;
      }

      /*
       * 2순위: REST fallback
       *
       * WebSocket 연결이 안 된 경우에도
       * 기존 Polling 채팅은 계속 동작해야 한다.
       */
      const savedMessage = await sendChatMessage(jarId, originalContent);

      const normalizedMessage = {
        ...savedMessage,
        mine: true,
      };

      shouldScrollToBottomRef.current = true;

      setMessages((prev) => mergeUniqueMessages(prev, [normalizedMessage]));

      await markLatestMessageAsRead([...messages, normalizedMessage]);
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

    // WebSocket 연결이 성공했으면 Polling은 멈춘다.
    // 새 메시지는 WebSocket으로 바로 받기 때문이다.
    if (webSocketConnected) return;

    let stopped = false;

    async function pollNewMessages() {
      const afterMessageId = lastMessageIdRef.current;

      // 메시지가 하나도 없는 상태에서 WebSocket이 실패했다면
      // 새 메시지 여부를 확인하기 위해 전체 목록을 다시 불러온다.
      if (!afterMessageId) {
        await loadInitialMessages();
        return;
      }

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
          return mergeUniqueMessages(prev, newItems);
        });

        const newestMessageId = getLastMessageId(newItems);

        if (newestMessageId) {
          await markChatAsRead(jarId, newestMessageId);
          await loadUnreadCount();
        }
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
  }, [jarId, webSocketConnected, loadInitialMessages, loadUnreadCount]);

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
            {webSocketConnected
              ? "WebSocket으로 새 메시지를 실시간으로 받고 있어요."
              : "WebSocket 연결 전에는 Polling 방식으로 새 메시지를 확인하고 있어요."}
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
              const isFirstUnread =
                firstUnreadMessageId != null &&
                Number(message.messageId) === Number(firstUnreadMessageId);

              if (isSystem) {
                return (
                  <div key={message.messageId}>
                    {isFirstUnread && (
                      <div className="my-3 flex items-center gap-3">
                        <div className="h-px flex-1 bg-emerald-200" />
                        <span className="rounded-full bg-emerald-100 px-3 py-1 text-[11px] font-black text-emerald-700">
                          여기부터 안 읽은 메시지예요
                        </span>
                        <div className="h-px flex-1 bg-emerald-200" />
                      </div>
                    )}

                    <div
                      ref={(element) => {
                        if (element) {
                          messageElementRefs.current[message.messageId] = element;
                        } else {
                          delete messageElementRefs.current[message.messageId];
                        }
                      }}
                      className="flex justify-center"
                    >
                      <div className="rounded-full bg-slate-200 px-4 py-2 text-xs font-bold text-slate-500">
                        {message.content}
                      </div>
                    </div>
                  </div>
                );
              }

              return (
                <div key={message.messageId}>
                  {isFirstUnread && (
                    <div className="my-3 flex items-center gap-3">
                      <div className="h-px flex-1 bg-emerald-200" />
                      <span className="rounded-full bg-emerald-100 px-3 py-1 text-[11px] font-black text-emerald-700">
                        여기부터 안 읽은 메시지예요
                      </span>
                      <div className="h-px flex-1 bg-emerald-200" />
                    </div>
                  )}

                  <div
                    ref={(element) => {
                      if (element) {
                        messageElementRefs.current[message.messageId] = element;
                      } else {
                        delete messageElementRefs.current[message.messageId];
                      }
                    }}
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
                </div>
              );
            })}

            {hasNewer && (
              <div className="flex justify-center pt-2">
                <button
                  type="button"
                  onClick={handleLoadNewer}
                  disabled={loadingNewer}
                  className="rounded-full border border-emerald-200 bg-white px-4 py-2 text-xs font-black text-emerald-600 shadow-sm transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loadingNewer ? "불러오는 중..." : "이후 채팅 더 보기"}
                </button>
              </div>
            )}
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