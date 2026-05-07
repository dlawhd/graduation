// src/pages/JarDetailPage.jsx

import { useEffect, useMemo, useState, useRef } from "react";
import { Link, useNavigate, useParams, useLocation } from "react-router-dom";
import apiClient, { fetchCsrf } from "../api/apiClient";
import { getChatUnreadCount } from "../api/chatApi";
import NoteSection from "./NoteSection";
import JarChatPanel from "./JarChatPanel";
import {
  createJarMemberSocketClient,
  disconnectJarMemberSocket,
} from "../api/jarMemberSocketApi";
import {
  createNoteSocketClient,
  disconnectNoteSocket,
} from "../api/noteSocketApi";
import {
  createJarOpenSocketClient,
  disconnectJarOpenSocket,
} from "../api/jarOpenSocketApi";
import {
  drawDailyDrawToday,
  getDailyDrawToday,
  getDailyDrawHistory,
} from "../api/dailyDrawApi";
import {
  createDailyDrawSocketClient,
  disconnectDailyDrawSocket,
} from "../api/dailyDrawSocketApi";

// 영어 enum 값을 화면용 한글로 바꿔주는 작은 사전
const OPEN_MODE_LABEL = {
  ALL_AT_ONCE: "한 번에 전체 공개",
  DAILY_DRAW: "하루 1장 랜덤 공개",
};

const LOCK_LEVEL_LABEL = {
  HIDDEN: "완전 비밀",
  META_ONLY: "메타만 공개",
  TITLE_ONLY: "제목만 공개",
};

const ROLE_LABEL = {
  OWNER: "방장",
  ADMIN: "관리자",
  MEMBER: "멤버",
};

const THEME_LABEL = {
  // 새 테마 값
  SPRING: "봄",
  WINTER: "겨울",
  SUMMER: "여름",
  LAVENDER: "라벤더",

  // 예전 값 호환용
  // 기존 데이터가 잠깐 남아 있어도 상세 화면이 깨지지 않게 둔다.
  COUPLE: "봄",
  FRIEND: "겨울",
  FAMILY: "여름",
  CUSTOM: "라벤더",
};

// 리액션 enum 값을 화면용 이모지/이름으로 바꿔주는 표
const REACTION_META = {
  LOVE: { emoji: "❤️", label: "사랑해" },
  SMILE: { emoji: "😊", label: "좋아" },
  LAUGH: { emoji: "😂", label: "웃겨" },
  TOUCHING: { emoji: "🥹", label: "감동" },
  MISS_YOU: { emoji: "🫶", label: "보고 싶어" },
  PROUD: { emoji: "🥰", label: "뿌듯해" },
  CHEER: { emoji: "👏", label: "응원해" },
  THANKFUL: { emoji: "🙏", label: "고마워" },
};

// 버튼 보여줄 순서
const REACTION_ORDER = [
  "LOVE",
  "SMILE",
  "LAUGH",
  "TOUCHING",
  "MISS_YOU",
  "PROUD",
  "CHEER",
  "THANKFUL",
];

// reactionCounts 배열을 안전하게 정리
function normalizeReactionCounts(counts) {
  if (!Array.isArray(counts)) return [];
  return counts.filter((item) => item && item.emoji);
}


/*
 * 이 함수는 댓글 응답을 "항상 트리 형태"로 안전하게 맞춰주는 역할을 해.
 *
 * 백엔드가
 * - 배열로 줄 수도 있고
 * - { items: [...] } 형태로 줄 수도 있어서
 * 먼저 items를 꺼내고,
 * replies도 항상 배열로 맞춰줘.
 */
function normalizeCommentItems(payload) {
  const rawItems = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.items)
    ? payload.items
    : [];

  return rawItems.map(normalizeCommentNode);
}

/*
 * 댓글 1개를 안전한 모양으로 바꿔줘.
 * replies가 없으면 빈 배열로 맞춰줘.
 */
function normalizeCommentNode(comment) {
  if (!comment || typeof comment !== "object") {
    return {
      commentId: null,
      userId: null,
      authorName: "",
      content: "",
      parentCommentId: null,
      createdAt: null,
      updatedAt: null,
      replies: [],
    };
  }

  return {
    ...comment,
    replies: Array.isArray(comment.replies)
      ? comment.replies.map(normalizeCommentNode)
      : [],
  };
}

/*
 * 댓글 총 개수를 세는 함수야.
 * 부모 댓글 + 대댓글까지 전부 더해줘.
 */
function getTotalCommentCount(comments) {
  if (!Array.isArray(comments) || comments.length === 0) return 0;

  return comments.reduce((total, comment) => {
    return total + 1 + getTotalCommentCount(comment.replies || []);
  }, 0);
}

// 특정 리액션 개수 찾기
function getReactionCount(note, emoji) {
  const counts = normalizeReactionCounts(note?.reactionCounts);
  const found = counts.find((item) => item.emoji === emoji);
  return found?.count ?? 0;
}

// 댓글 내용을 안전하게 정리하는 함수
function normalizeCommentContent(value) {
  return typeof value === "string" ? value.trim() : "";
}

// 특정 댓글이 댓글 트리 어디에 있는지 "길"을 찾아주는 함수
// 예:
// 부모 댓글 10 아래 답글 21 이 있으면 [10, 21] 반환
function findCommentPath(comments, targetCommentId, parents = []) {
  if (!Array.isArray(comments) || !targetCommentId) return null;

  for (const comment of comments) {
    const currentId = Number(comment?.commentId);
    const nextPath = [...parents, currentId];

    if (currentId === Number(targetCommentId)) {
      return nextPath;
    }

    const childPath = findCommentPath(
      Array.isArray(comment?.replies) ? comment.replies : [],
      targetCommentId,
      nextPath
    );

    if (childPath) {
      return childPath;
    }
  }

  return null;
}

// 댓글 강조 효과에 쓸 클래스 문자열
function getFocusedCommentClass(isFocused) {
  if (!isFocused) return "";
  return "ring-2 ring-emerald-300 bg-emerald-50/70";
}

/*
 * 이 컴포넌트는 리액션 버튼들을 한 줄로 보여주는 역할을 해.
 * - 현재 내가 누른 리액션은 강조해서 보여주고
 * - 각 리액션 개수도 같이 보여줘.
 */
function ReactionBar({
  note,
  palette,
  disabled = false,
  loading = false,
  onReact,
}) {
  const currentReaction = note?.myReaction ?? null;

  return (
    <div className="mt-4">
      <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
        리액션
      </p>

      <div className="flex flex-wrap gap-2">
        {REACTION_ORDER.map((reactionKey) => {
          const meta = REACTION_META[reactionKey];
          const isActive = currentReaction === reactionKey;
          const count = getReactionCount(note, reactionKey);

          return (
            <button
              key={reactionKey}
              type="button"
              disabled={disabled || loading}
              onClick={(e) => {
                e.stopPropagation();
                onReact?.(reactionKey);
              }}
              title={meta.label}
              className={`rounded-2xl border px-3 py-2 text-sm font-bold transition ${
                isActive ? palette.primaryButton : palette.outlineButton
              } ${
                disabled || loading
                  ? "cursor-not-allowed opacity-60"
                  : "hover:scale-[1.02]"
              }`}
            >
              <span className="mr-1">{meta.emoji}</span>
              <span>{count}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/*
 * 이 컴포넌트는 쪽지 상세 모달 아래에서
 * 댓글 목록 / 댓글 작성 / 댓글 수정 / 댓글 삭제 UI를 보여주는 역할
 *
 * 댓글 규칙
 * - 저금통 active 멤버만 가능
 * - 오픈 전에도 댓글 가능
 * - 작성자 본인만 수정/삭제 가능
 * - 오래된 댓글이 위, 새 댓글이 아래
 */
function CommentSection({
  palette,
  comments,
  loading,
  error,
  currentUserId,
  draft,
  onDraftChange,
  onCreate,
  submitting,
  editingCommentId,
  editingContent,
  onStartEdit,
  onEditChange,
  onCancelEdit,
  onUpdate,
  deletingCommentId,
  onDelete,
  replyTargetCommentId,
  replyDraftMap,
  onToggleReply,
  onReplyDraftChange,
  onCreateReply,
  replyExpandedMap,
  onToggleReplies,
  focusedCommentId,
}) {

    const totalCommentCount = getTotalCommentCount(comments);

  return (
      <div className="mt-5">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
            댓글
          </p>

          <span className={`rounded-full px-3 py-1 text-[11px] font-bold ${palette.countChip}`}>
            {totalCommentCount}개
          </span>
        </div>

        {/* 최상위 댓글 작성창 */}
        <div className={`rounded-[24px] border p-4 ${palette.panel}`}>
          <textarea
            rows={3}
            value={draft}
            onChange={(e) => onDraftChange(e.target.value)}
            placeholder="이 쪽지에 댓글을 남겨보세요."
            className={`w-full rounded-2xl border px-4 py-3 text-sm font-semibold outline-none transition ${palette.input}`}
          />

          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={onCreate}
              disabled={submitting}
              className={`rounded-2xl px-4 py-2 text-sm font-bold shadow-md transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60 ${palette.primaryButton}`}
            >
              {submitting ? "등록 중..." : "댓글 등록"}
            </button>
          </div>
        </div>

        {loading && (
          <div className="mt-4 space-y-3">
            {[1, 2].map((item) => (
              <div
                key={item}
                className={`animate-pulse rounded-2xl border p-4 ${palette.softCard}`}
              >
                <div className="mb-2 h-4 w-24 rounded-full bg-slate-200" />
                <div className="h-3 w-full rounded-full bg-slate-100" />
              </div>
            ))}
          </div>
        )}

        {!loading && error && (
          <div className={`mt-4 rounded-2xl border border-dashed px-4 py-4 text-sm ${palette.emptyBox}`}>
            {error}
          </div>
        )}

        {!loading && !error && comments.length === 0 && (
          <div className={`mt-4 rounded-2xl border border-dashed px-4 py-6 text-center text-sm ${palette.emptyBox}`}>
            아직 댓글이 없어요.
          </div>
        )}

        {!loading && !error && comments.length > 0 && (
          <div className="mt-4 space-y-4">
            {comments.map((comment) => {
              const isMine = Number(comment.userId) === Number(currentUserId);
              const isEditing = editingCommentId === comment.commentId;
              const replies = Array.isArray(comment.replies) ? comment.replies : [];
              const replyCount = replies.length;
              const isReplyExpanded = !!replyExpandedMap[comment.commentId];

              return (
                <div key={comment.commentId} className="space-y-3">
                  {/* 부모 댓글 */}
                  <div
                    id={`jar-comment-${comment.commentId}`}
                    className={`rounded-2xl border p-4 ${palette.softCard} ${getFocusedCommentClass(
                      Number(focusedCommentId) === Number(comment.commentId)
                    )}`}
                  >
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-black text-slate-800">
                          {comment.authorName || `사용자 ${comment.userId}`}
                        </p>
                        <p className="text-[11px] font-semibold text-slate-400">
                          {formatDate(comment.createdAt)}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => onToggleReply(comment.commentId)}
                          className={`rounded-full border px-3 py-1 text-[11px] font-bold transition ${palette.outlineBtn}`}
                        >
                          답글
                        </button>

                        {isMine && !isEditing && (
                          <>
                            <button
                              type="button"
                              onClick={() => onStartEdit(comment)}
                              className={`rounded-full border px-3 py-1 text-[11px] font-bold transition ${palette.outlineBtn}`}
                            >
                              수정
                            </button>

                            <button
                              type="button"
                              onClick={() => onDelete(comment.commentId)}
                              disabled={deletingCommentId === comment.commentId}
                              className={`rounded-full px-3 py-1 text-[11px] font-bold transition disabled:cursor-not-allowed disabled:opacity-60 ${palette.dangerBtn}`}
                            >
                              {deletingCommentId === comment.commentId ? "삭제 중..." : "삭제"}
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {!isEditing && (
                      <p className="text-sm leading-7 text-slate-700">
                        {comment.content}
                      </p>
                    )}

                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        onClick={() => onToggleReply(comment.commentId)}
                        className="text-xs font-bold text-slate-500 transition hover:text-slate-700"
                      >
                        {replyTargetCommentId === comment.commentId ? "답글 닫기" : "답글 달기"}
                      </button>

                      {replyCount > 0 && (
                        <button
                          type="button"
                          onClick={() => onToggleReplies(comment.commentId)}
                          className="text-xs font-bold text-slate-500 transition hover:text-slate-700"
                        >
                          {isReplyExpanded ? "답글 숨기기" : `답글 ${replyCount}개 더 보기`}
                        </button>
                      )}
                    </div>

                    {isEditing && (
                      <div className="space-y-3">
                        <textarea
                          rows={3}
                          value={editingContent}
                          onChange={(e) => onEditChange(e.target.value)}
                          className={`w-full rounded-2xl border px-4 py-3 text-sm font-semibold outline-none transition ${palette.input}`}
                        />

                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={onCancelEdit}
                            className={`rounded-2xl border px-4 py-2 text-sm font-bold transition ${palette.outlineBtn}`}
                          >
                            취소
                          </button>

                          <button
                            type="button"
                            onClick={() => onUpdate(comment.commentId)}
                            disabled={submitting}
                            className={`rounded-2xl px-4 py-2 text-sm font-bold shadow-md transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60 ${palette.primaryButton}`}
                          >
                            {submitting ? "저장 중..." : "수정 저장"}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* 답글 작성창 */}
                    {replyTargetCommentId === comment.commentId && (
                      <div className="mt-4 rounded-2xl border border-dashed p-3">
                        <textarea
                          rows={2}
                          value={replyDraftMap[comment.commentId] || ""}
                          onChange={(e) =>
                            onReplyDraftChange(comment.commentId, e.target.value)
                          }
                          placeholder="이 댓글에 답글을 남겨보세요."
                          className={`w-full rounded-2xl border px-4 py-3 text-sm font-semibold outline-none transition ${palette.input}`}
                        />

                        <div className="mt-3 flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => onToggleReply(comment.commentId)}
                            className={`rounded-2xl border px-4 py-2 text-sm font-bold transition ${palette.outlineBtn}`}
                          >
                            답글 닫기
                          </button>

                          <button
                            type="button"
                            onClick={() => onCreateReply(comment.commentId)}
                            disabled={submitting}
                            className={`rounded-2xl px-4 py-2 text-sm font-bold shadow-md transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60 ${palette.primaryButton}`}
                          >
                            {submitting ? "등록 중..." : "답글 등록"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 대댓글 목록 */}
                  {replyCount > 0 && isReplyExpanded && (
                    <div className="ml-6 space-y-2 border-l-2 border-slate-200 pl-4">
                      {replies.map((reply) => {
                        const isReplyMine = Number(reply.userId) === Number(currentUserId);
                        const isReplyEditing = editingCommentId === reply.commentId;

                        return (
                          <div
                            key={reply.commentId}
                            id={`jar-comment-${reply.commentId}`}
                            className={`rounded-2xl border p-4 ${palette.panelSoft} ${getFocusedCommentClass(
                              Number(focusedCommentId) === Number(reply.commentId)
                            )}`}
                          >
                            <div className="mb-2 flex items-center justify-between gap-3">
                              <div>
                                <p className="text-sm font-black text-slate-800">
                                  {reply.authorName || `사용자 ${reply.userId}`}
                                </p>
                                <p className="text-[11px] font-semibold text-slate-400">
                                  {formatDate(reply.createdAt)}
                                </p>
                              </div>

                              {isReplyMine && !isReplyEditing && (
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => onStartEdit(reply)}
                                    className={`rounded-full border px-3 py-1 text-[11px] font-bold transition ${palette.outlineBtn}`}
                                  >
                                    수정
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => onDelete(reply.commentId)}
                                    disabled={deletingCommentId === reply.commentId}
                                    className={`rounded-full px-3 py-1 text-[11px] font-bold transition disabled:cursor-not-allowed disabled:opacity-60 ${palette.dangerBtn}`}
                                  >
                                    {deletingCommentId === reply.commentId ? "삭제 중..." : "삭제"}
                                  </button>
                                </div>
                              )}
                            </div>

                            {!isReplyEditing && (
                              <p className="text-sm leading-7 text-slate-700">
                                {reply.content}
                              </p>
                            )}

                            {isReplyEditing && (
                              <div className="space-y-3">
                                <textarea
                                  rows={3}
                                  value={editingContent}
                                  onChange={(e) => onEditChange(e.target.value)}
                                  className={`w-full rounded-2xl border px-4 py-3 text-sm font-semibold outline-none transition ${palette.input}`}
                                />

                                <div className="flex justify-end gap-2">
                                  <button
                                    type="button"
                                    onClick={onCancelEdit}
                                    className={`rounded-2xl border px-4 py-2 text-sm font-bold transition ${palette.outlineBtn}`}
                                  >
                                    취소
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => onUpdate(reply.commentId)}
                                    disabled={submitting}
                                    className={`rounded-2xl px-4 py-2 text-sm font-bold shadow-md transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60 ${palette.primaryButton}`}
                                  >
                                    {submitting ? "저장 중..." : "수정 저장"}
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }


// 초대코드는 한 번에 2개씩만 보여줄 거야.
const INVITES_PER_PAGE = 2;

// 날짜를 보기 좋게 바꿔주는 함수
function formatDate(dateTime) {
  if (!dateTime) return "-";

  return new Date(dateTime).toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/*
 * me 응답에서 현재 로그인한 사용자 id를 안전하게 꺼내는 함수야.
 *
 * 백엔드 응답이 userId일 수도 있고 id일 수도 있으니 둘 다 대응해.
 */
function getCurrentUserIdFromMe(me) {
  const value = me?.userId ?? me?.id;

  if (value === null || value === undefined) {
    return null;
  }

  const numberValue = Number(value);

  return Number.isFinite(numberValue) ? numberValue : null;
}

// input type="datetime-local"에 넣기 좋은 형태로 바꿔줘.
function formatDateTimeLocalValue(dateTime) {
  if (!dateTime) return "";

  const date = new Date(dateTime);

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");

  return `${year}-${month}-${day}T${hour}:${minute}`;
}

// 백엔드가 OffsetDateTime을 받으니까
// 한국 시간(+09:00)을 붙여서 안전하게 보내는 함수야.
function toKstOffsetDateTime(localValue) {
  if (!localValue) return null;
  return `${localValue}:00+09:00`;
}

// 오픈 상태를 사람이 읽기 쉽게 정리해주는 함수
function getOpenStatus(jar) {
  if (!jar) {
    return {
      label: "확인 중",
      description: "저금통 상태를 불러오는 중이에요.",
      chipClass: "bg-slate-100 text-slate-600",
    };
  }

  if (jar.isOpen) {
    return {
      label: "OPEN",
      description: "지금은 저금통이 열려 있어요.",
      chipClass: "bg-emerald-100 text-emerald-700",
    };
  }

  return {
    label: "LOCKED",
    description: "아직은 저금통이 잠겨 있어요.",
    chipClass: "bg-amber-100 text-amber-700",
  };
}

// 저금통 종류(theme)에 따라 큰 카드 + 아래 멤버/초대 카드 색까지 같이 정해줘.
function getThemePalette(theme) {
  // 봄 테마
  // 새 값 SPRING과 예전 값 COUPLE을 같은 분홍/주황 색감으로 보여준다.
  if (theme === "SPRING" || theme === "COUPLE") {
    return {
      hero: "from-rose-100 via-pink-50 to-orange-50 border-rose-200",
      badge: "bg-gradient-to-r from-rose-400 to-orange-400 text-white",
      jarBody: "bg-gradient-to-b from-rose-100 via-pink-50 to-white border-rose-200",
      lid: "bg-gradient-to-r from-rose-400 to-orange-400",
      floating: "bg-rose-200/60",
      section: "border-rose-200/70 bg-gradient-to-br from-rose-50/95 via-white to-orange-50/90",
      softCard: "border-rose-100 bg-white/80",
      emptyBox: "border-rose-200 bg-rose-50/60 text-rose-600",
      countChip: "bg-rose-100 text-rose-700",
      activeChip: "bg-orange-100 text-orange-700",
      input: "border-rose-200 bg-white/90 text-slate-700 focus:border-rose-300",
      primaryButton: "bg-gradient-to-r from-rose-400 to-orange-400 text-white",
      outlineButton: "border-rose-200 bg-white/85 text-rose-700 hover:bg-rose-50",
      avatar: "bg-gradient-to-br from-rose-200 to-orange-200 text-slate-700",
      panel: "border-rose-200/70 bg-white/78",
      panelSoft: "border-rose-100 bg-white/70",
      infoBox: "border-rose-100/80 bg-rose-50/55",
      outlineBtn: "border-rose-200 bg-white/80 text-rose-700 hover:bg-rose-50",
      dangerBtn: "bg-gradient-to-r from-rose-500 to-orange-500 text-white",
      hintBox: "border-rose-200/80 bg-white/65 text-rose-700",
      // 커플 저금통 전용 초대 카드 색
      inviteCard:
        "border-rose-200/80 bg-gradient-to-br from-rose-50/90 via-white/92 to-orange-50/85",
      inviteInfoBox:
        "border-rose-200/80 bg-white/88",
      inviteStatusActive:
        "bg-rose-100 text-rose-700",
      inviteStatusUsed:
        "bg-orange-100 text-orange-700",
      inviteStatusRevoked:
        "bg-slate-200 text-slate-700",
      inviteStatusExpired:
        "bg-amber-100 text-amber-700",
    };
  }

  // 겨울 테마
  // 새 값 WINTER와 예전 값 FRIEND를 같은 파랑/하양 색감으로 보여준다.
  if (theme === "WINTER" || theme === "FRIEND") {
    return {
      hero: "from-sky-100 via-cyan-50 to-indigo-50 border-sky-200",
      badge: "bg-gradient-to-r from-sky-500 to-indigo-500 text-white",
      jarBody: "bg-gradient-to-b from-sky-100 via-cyan-50 to-white border-sky-200",
      lid: "bg-gradient-to-r from-sky-500 to-indigo-500",
      floating: "bg-sky-200/60",
      section: "border-sky-200/70 bg-gradient-to-br from-sky-50/95 via-white to-indigo-50/90",
      softCard: "border-sky-100 bg-white/80",
      emptyBox: "border-sky-200 bg-sky-50/60 text-sky-700",
      countChip: "bg-sky-100 text-sky-700",
      activeChip: "bg-indigo-100 text-indigo-700",
      input: "border-sky-200 bg-white/90 text-slate-700 focus:border-sky-300",
      primaryButton: "bg-gradient-to-r from-sky-500 to-indigo-500 text-white",
      outlineButton: "border-sky-200 bg-white/85 text-sky-700 hover:bg-sky-50",
      avatar: "bg-gradient-to-br from-sky-200 to-indigo-200 text-slate-700",
      panel: "border-sky-200/70 bg-white/78",
      panelSoft: "border-sky-100 bg-white/70",
      infoBox: "border-sky-100/80 bg-sky-50/55",
      outlineBtn: "border-sky-200 bg-white/80 text-sky-700 hover:bg-sky-50",
      dangerBtn: "bg-gradient-to-r from-sky-500 to-indigo-500 text-white",
      hintBox: "border-sky-200/80 bg-white/65 text-sky-700",
      // 친구 저금통 전용 초대 카드 색
      inviteCard:
        "border-sky-200/80 bg-gradient-to-br from-sky-50/90 via-white/92 to-indigo-50/85",
      inviteInfoBox:
        "border-sky-200/80 bg-white/88",
      inviteStatusActive:
        "bg-sky-100 text-sky-700",
      inviteStatusUsed:
        "bg-indigo-100 text-indigo-700",
      inviteStatusRevoked:
        "bg-slate-200 text-slate-700",
      inviteStatusExpired:
        "bg-amber-100 text-amber-700",
    };
  }

  // 여름 테마
  // 새 값 SUMMER와 예전 값 FAMILY를 같은 초록/햇살 색감으로 보여준다.
  if (theme === "SUMMER" || theme === "FAMILY") {
    return {
      hero: "from-emerald-100 via-lime-50 to-amber-50 border-emerald-200",
      badge: "bg-gradient-to-r from-emerald-500 to-lime-500 text-white",
      jarBody: "bg-gradient-to-b from-emerald-100 via-lime-50 to-white border-emerald-200",
      lid: "bg-gradient-to-r from-emerald-500 to-lime-500",
      floating: "bg-emerald-200/60",
      section: "border-emerald-200/70 bg-gradient-to-br from-emerald-50/95 via-white to-lime-50/90",
      softCard: "border-emerald-100 bg-white/80",
      emptyBox: "border-emerald-200 bg-emerald-50/60 text-emerald-700",
      countChip: "bg-emerald-100 text-emerald-700",
      activeChip: "bg-lime-100 text-lime-700",
      input: "border-emerald-200 bg-white/90 text-slate-700 focus:border-emerald-300",
      primaryButton: "bg-gradient-to-r from-emerald-500 to-lime-500 text-white",
      outlineButton: "border-emerald-200 bg-white/85 text-emerald-700 hover:bg-emerald-50",
      avatar: "bg-gradient-to-br from-emerald-200 to-lime-200 text-slate-700",
      panel: "border-emerald-200/70 bg-white/78",
      panelSoft: "border-emerald-100 bg-white/70",
      infoBox: "border-emerald-100/80 bg-emerald-50/55",
      outlineBtn: "border-emerald-200 bg-white/80 text-emerald-700 hover:bg-emerald-50",
      dangerBtn: "bg-gradient-to-r from-emerald-500 to-lime-500 text-white",
      hintBox: "border-emerald-200/80 bg-white/65 text-emerald-700",
      // 가족 저금통 전용 초대 카드 색
      inviteCard:
        "border-emerald-200/80 bg-gradient-to-br from-emerald-50/90 via-white/92 to-lime-50/85",
      inviteInfoBox:
        "border-emerald-200/80 bg-white/88",
      inviteStatusActive:
        "bg-emerald-100 text-emerald-700",
      inviteStatusUsed:
        "bg-lime-100 text-lime-700",
      inviteStatusRevoked:
        "bg-slate-200 text-slate-700",
      inviteStatusExpired:
        "bg-amber-100 text-amber-700",
    };
  }

  // 라벤더 테마
  // 새 값 LAVENDER와 예전 값 CUSTOM은 여기 기본 보라색 스타일을 사용한다.
  return {
    hero: "from-violet-100 via-fuchsia-50 to-pink-50 border-violet-200",
    badge: "bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white",
    jarBody: "bg-gradient-to-b from-violet-100 via-fuchsia-50 to-white border-violet-200",
    lid: "bg-gradient-to-r from-violet-500 to-fuchsia-500",
    floating: "bg-violet-200/60",
    section: "border-violet-200/70 bg-gradient-to-br from-violet-50/95 via-white to-fuchsia-50/90",
    softCard: "border-violet-100 bg-white/80",
    emptyBox: "border-violet-200 bg-violet-50/60 text-violet-700",
    countChip: "bg-violet-100 text-violet-700",
    activeChip: "bg-fuchsia-100 text-fuchsia-700",
    input: "border-violet-200 bg-white/90 text-slate-700 focus:border-violet-300",
    primaryButton: "bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white",
    outlineButton: "border-violet-200 bg-white/85 text-violet-700 hover:bg-violet-50",
    avatar: "bg-gradient-to-br from-violet-200 to-fuchsia-200 text-slate-700",
    panel: "border-violet-200/70 bg-white/78",
    panelSoft: "border-violet-100 bg-white/70",
    infoBox: "border-violet-100/80 bg-violet-50/55",
    outlineBtn: "border-violet-200 bg-white/80 text-violet-700 hover:bg-violet-50",
    dangerBtn: "bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white",
    hintBox: "border-violet-200/80 bg-white/65 text-violet-700",
    // 커스텀 저금통 전용 초대 카드 색
    inviteCard:
      "border-violet-200/80 bg-gradient-to-br from-violet-50/90 via-white/92 to-fuchsia-50/85",
    inviteInfoBox:
      "border-violet-200/80 bg-white/88",
    inviteStatusActive:
      "bg-violet-100 text-violet-700",
    inviteStatusUsed:
      "bg-fuchsia-100 text-fuchsia-700",
    inviteStatusRevoked:
      "bg-slate-200 text-slate-700",
    inviteStatusExpired:
      "bg-amber-100 text-amber-700",
  };
}

/*
 * getThemeEmoji 역할
 *
 * 저금통 테마에 맞는 대표 이모지를 하나 골라주는 함수야.
 *
 * 쉽게 말하면:
 * - 봄 저금통이면 🌸
 * - 겨울 저금통이면 ❄️
 * - 여름 저금통이면 🌿
 * - 라벤더 저금통이면 💜
 * 를 보여주는 역할이야.
 */
function getThemeEmoji(theme) {
  // 봄: 기존 커플 추억 역할
  if (theme === "SPRING" || theme === "COUPLE") return "🌸";

  // 겨울: 기존 친구 우정 역할
  if (theme === "WINTER" || theme === "FRIEND") return "❄️";

  // 여름: 기존 가족 추억 역할
  if (theme === "SUMMER" || theme === "FAMILY") return "🌿";

  // 라벤더: 기존 직접 만들기 역할
  return "💜";
}

// 저금통 종류마다 가운데 대표 이모지를 하나씩 보여줘.
function getJarSnowballTheme(theme) {
  // 봄: 벚꽃잎 느낌
  if (theme === "SPRING" || theme === "COUPLE") {
    return {
      label: "벚꽃",
      icons: ["🌸", "🌸", "💮", "🩷"],
      count: 8,
    };
  }

  // 겨울: 눈송이 느낌
  if (theme === "WINTER" || theme === "FRIEND") {
    return {
      label: "눈",
      icons: ["❄️", "❄️", "🤍", "❅"],
      count: 10,
    };
  }

  // 여름: 잎사귀가 둥둥 떠다니는 느낌
  if (theme === "SUMMER" || theme === "FAMILY") {
    return {
      label: "잎사귀",
      icons: ["🌿", "🍃", "☘️", "💚"],
      count: 8,
    };
  }

  // 라벤더: 보라빛 꽃과 반짝이 느낌
  return {
    label: "라벤더",
    icons: ["💜", "🔮", "🪻", "🟣"],
    count: 8,
  };
}

/*
 * createJarSnowballParticles 역할
 *
 * 저금통 안에서 자연스럽게 흩날릴 작은 장식들을 만들어줘.
 *
 * 이번 버전의 핵심:
 * - 한 번에 많이 만들지 않는다.
 * - 2~3개씩 조금씩 만든다.
 * - 각 장식은 자기 시간이 끝나면 따로 사라진다.
 *
 * 쉽게 말하면:
 * 눈이 한 번에 우르르 내리는 게 아니라,
 * 계속 조금씩 살살 내리게 만드는 함수야.
 */
function createJarSnowballParticles(theme, count = 2) {
  const snowballTheme = getJarSnowballTheme(theme);

  return Array.from({ length: count }, (_, index) => {
    const icon =
      snowballTheme.icons[
        Math.floor(Math.random() * snowballTheme.icons.length)
      ];

    const duration = 3.2 + Math.random() * 1.4;
    const delay = Math.random() * 0.35;

    return {
      id: `${Date.now()}-${index}-${Math.random()}`,
      icon,

      // 위쪽에서 자연스럽게 시작
      left: 20 + Math.random() * 60,
      top: 6 + Math.random() * 18,

      // 너무 크지 않게 은은하게
      size: 15 + Math.random() * 7,

      // 좌우로 살짝 흔들리면서 내려감
      fallX: -28 + Math.random() * 56,
      fallY: 115 + Math.random() * 70,

      // 회전
      rotate: -100 + Math.random() * 200,

      // 각 파티클마다 다른 속도
      duration,
      delay,

      // 이 시간이 지나면 이 파티클만 제거할 거야.
      lifetime: duration + delay + 0.35,
    };
  });
}

/*
 * JarVisual 역할
 *
 * 이 컴포넌트는 저금통 상세 페이지 가운데에 보이는
 * "큰 저금통 그림"을 담당해.
 *
 * 이번 버전:
 * - 사용자가 누르지 않아도 자동으로 테마별 장식이 살짝 떨어진다.
 * - 봄은 벚꽃, 겨울은 눈, 여름은 잎사귀, 라벤더는 보라빛 장식이 나온다.
 * - 기존 "크게 보기" 기능은 아래 작은 버튼으로 유지한다.
 *
 * 쉽게 말하면:
 * 가만히 보고 있어도 저금통 안에서 스노우볼처럼 장식이 계속 살짝 흩날리는 효과야.
 */
function JarVisual({ jar, jarRef, onClick, interactive = false }) {
  const palette = getThemePalette(jar?.theme);

  // 현재 테마에 맞는 파티클 정보
  const snowballTheme = getJarSnowballTheme(jar?.theme);

  // 화면에 보이는 벚꽃/눈/잎사귀 목록
  const [particles, setParticles] = useState([]);

  // 자동으로 2~3개씩 추가하는 interval 저장소
  const snowballIntervalRef = useRef(null);

  // 각 파티클을 나중에 지우는 타이머들을 모아두는 저장소
  const particleRemoveTimerRefs = useRef([]);

  /*
   * playSnowballEffect 역할
   *
   * 파티클을 한 번에 전부 갈아끼우지 않고,
   * 2~3개씩 계속 추가해준다.
   *
   * 그래서 화면이 끊기지 않고 자연스럽게 이어져 보여.
   */
  function playSnowballEffect() {
    // 이번에 추가할 개수: 2개 또는 3개
    const nextCount = Math.random() > 0.55 ? 3 : 2;

    // 새 파티클 2~3개 생성
    const nextParticles = createJarSnowballParticles(jar?.theme, nextCount);

    // 기존 파티클은 유지하고, 새 파티클만 뒤에 추가
    setParticles((prev) => {
      // 너무 많이 쌓이면 화면이 복잡해지니까 최대 18개 정도만 유지
      const merged = [...prev, ...nextParticles];
      return merged.slice(-18);
    });

    // 각 파티클은 자기 수명이 끝나면 혼자 사라지게 한다.
    nextParticles.forEach((particle) => {
      const timerId = window.setTimeout(() => {
        setParticles((prev) =>
          prev.filter((item) => item.id !== particle.id)
        );
      }, particle.lifetime * 1000);

      particleRemoveTimerRefs.current.push(timerId);
    });
  }

  /*
   * 저금통이 화면에 보이면 파티클을 계속 조금씩 추가한다.
   *
   * 핵심:
   * - 650ms마다 2~3개씩 추가
   * - 기존 파티클은 갑자기 지우지 않음
   * - 각 파티클이 자기 애니메이션이 끝나면 알아서 사라짐
   */
  useEffect(() => {
    if (!interactive) return;

    // 처음 들어왔을 때 너무 비어 보이지 않게 바로 한 번 실행
    playSnowballEffect();

    // 이후 계속 2~3개씩 자연스럽게 추가
    snowballIntervalRef.current = window.setInterval(() => {
      playSnowballEffect();
    }, 650);

    return () => {
      // 자동 추가 interval 정리
      if (snowballIntervalRef.current) {
        window.clearInterval(snowballIntervalRef.current);
      }

      // 파티클 삭제 예약 타이머들 정리
      particleRemoveTimerRefs.current.forEach((timerId) => {
        window.clearTimeout(timerId);
      });

      particleRemoveTimerRefs.current = [];
    };
  }, [interactive, jar?.theme]);

  /*
   * 기존 "저금통 크게 보기" 기능
   *
   * 자동 효과와 분리해서,
   * 크게 보고 싶을 때는 아래 작은 버튼을 누르도록 한다.
   */
  function handleOpenZoom(e) {
    e.preventDefault();
    e.stopPropagation();
    onClick?.();
  }

  return (
    <div
      ref={jarRef}
      className="relative mx-auto flex h-[320px] w-[260px] items-center justify-center outline-none"
      aria-label="저금통"
    >
      {/* 이 컴포넌트 안에서만 쓰는 애니메이션 CSS */}
      <style>
        {`
          @keyframes jarSnowballParticleFall {
            0% {
              opacity: 0;
              transform: translate(0, -10px) rotate(0deg) scale(0.75);
            }

            12% {
              opacity: 0.9;
            }

            55% {
              opacity: 0.9;
            }

            100% {
              opacity: 0;
              transform:
                translate(var(--fall-x), var(--fall-y))
                rotate(var(--fall-rotate))
                scale(1);
            }
          }

          .jar-snowball-particle {
            animation-name: jarSnowballParticleFall;
            animation-duration: var(--fall-duration);
            animation-delay: var(--fall-delay);
            animation-timing-function: ease-in-out;
            animation-fill-mode: forwards;
            will-change: transform, opacity;
          }

          @keyframes jarSnowballSoftFloat {
            0%, 100% {
              transform: translateY(0);
            }
            50% {
              transform: translateY(-3px);
            }
          }

          .jar-snowball-soft-float {
            animation: jarSnowballSoftFloat 3.2s ease-in-out infinite;
          }
        `}
      </style>

      {/* 저금통 그림 전체 */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center jar-snowball-soft-float">
        {/* 뒤쪽 둥근 빛 */}
        <div
          className={`absolute inset-6 rounded-full blur-3xl ${palette.floating}`}
        />

        {/* 뚜껑 */}
        <div
          className={`absolute top-[48px] z-20 h-10 w-36 rounded-full ${palette.lid} shadow-lg`}
        />
        <div className="absolute top-[60px] z-30 h-2 w-14 rounded-full bg-slate-700/80" />

        {/* 저금통 몸통 */}
        <div
          className={`relative z-10 mt-8 h-[210px] w-[180px] overflow-hidden rounded-[42%_42%_28%_28%] border-4 ${palette.jarBody} shadow-[0_20px_50px_rgba(15,23,42,0.12)]`}
        >
          {/* 유리 느낌 하이라이트 */}
          <div className="absolute left-6 top-6 z-30 h-24 w-8 rounded-full bg-white/60 blur-sm" />
          <div className="absolute right-8 top-10 z-30 h-16 w-4 rounded-full bg-white/40 blur-sm" />

          {/*
            자동 스노우볼 파티클
            - 사용자가 누르지 않아도 일정 시간마다 particles 배열이 채워진다.
            - overflow-hidden 덕분에 장식이 저금통 몸통 안에서만 보인다.
          */}
          {particles.map((particle) => (
            <span
              key={particle.id}
              className="jar-snowball-particle absolute z-20 select-none"
              style={{
                left: `${particle.left}%`,
                top: `${particle.top}%`,
                fontSize: `${particle.size}px`,
                "--fall-x": `${particle.fallX}px`,
                "--fall-y": `${particle.fallY}px`,
                "--fall-rotate": `${particle.rotate}deg`,
                "--fall-duration": `${particle.duration}s`,
                "--fall-delay": `${particle.delay}s`,
              }}
            >
              {particle.icon}
            </span>
          ))}

          {/* 안쪽 아이콘 */}
          <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-3">
            <div className="text-5xl">{getThemeEmoji(jar?.theme)}</div>

            <div className="rounded-full bg-white/80 px-4 py-2 text-sm font-bold text-slate-700 shadow">
              {jar?.isOpen ? "열린 저금통" : "잠긴 저금통"}
            </div>

            <div className="text-center text-xs text-slate-500">
              {ROLE_LABEL[jar?.myRole] || jar?.myRole}
            </div>


          </div>
        </div>
      </div>

      {/* 기존 확대 모달 열기 버튼 */}
      {interactive && (
        <button
          type="button"
          onClick={handleOpenZoom}
          className="absolute bottom-2 left-1/2 z-40 -translate-x-1/2 rounded-full bg-white/90 px-3 py-1.5 text-[11px] font-black text-slate-500 shadow-sm transition hover:-translate-y-0.5 hover:bg-white"
        >
          크게 보기
        </button>
      )}
    </div>
  );
}

// 쪽지 목록 응답이 배열일 수도 있고, items 형태일 수도 있어서 맞춰주는 함수
function normalizeJarZoomNotes(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }

  return Array.isArray(payload?.items) ? payload.items : [];
}

function normalizeJarZoomTags(tags) {
  if (Array.isArray(tags)) {
    return tags
      .map((tag) => (typeof tag === "string" ? tag.trim() : ""))
      .filter(Boolean);
  }

  if (typeof tags === "string") {
    return tags
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
  }

  return [];
}

function toSafeNoteText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function formatNoteDateOnly(value) {
  if (!value) return "-";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}


// 확대 모달 오른쪽 목록에 보여줄 짧은 문구
function getJarZoomNotePreview(note, jar) {
  const title =
    typeof note?.title === "string" ? note.title.trim() : "";
  const content =
    typeof note?.content === "string" ? note.content.trim() : "";
  const location =
    typeof note?.location === "string" ? note.location.trim() : "";

  if (jar?.isOpen && content) {
    return content.length > 42 ? `${content.slice(0, 42)}...` : content;
  }

  if (title) {
    return title;
  }

  if (location) {
    return `장소: ${location}`;
  }

  if (note?.noteDate) {
    return `날짜: ${note.noteDate}`;
  }

  if (jar?.lockLevel === "META_ONLY") {
    return "메타 정보만 보여주는 추억이에요.";
  }

  return "아직 비밀로 잠겨 있는 추억이에요.";
}

function JarZoomNoteDetailModal({
  open,
  note,
  loading,
  error,
  jar,
  palette,
  onClose,
  onRetry,
  onReact,
  reacting,
  comments,
  commentsLoading,
  commentsError,
  currentUserId,
  commentDraft,
  onCommentDraftChange,
  onCreateComment,
  commentSubmitting,
  editingCommentId,
  editingContent,
  onStartEditComment,
  onEditCommentChange,
  onCancelEditComment,
  onUpdateComment,
  deletingCommentId,
  onDeleteComment,
  replyTargetCommentId,
  replyDraftMap,
  onToggleReply,
  onReplyDraftChange,
  onCreateReply,
  replyExpandedMap,
  onToggleReplies,
  focusedCommentId,
}) {
    const tags = normalizeJarZoomTags(note?.tags);
    const hasContent = toSafeNoteText(note?.content).length > 0;

    const [selectedIndex, setSelectedIndex] = useState(null);
    const [zoom, setZoom] = useState(1);

    const images = note?.attachments || [];
    const currentImage =
      selectedIndex !== null ? images[selectedIndex] : null;

    const [position, setPosition] = useState({ x: 0, y: 0 });
    const [dragging, setDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    const [lastPosition, setLastPosition] = useState({ x: 0, y: 0 });

    function handleDragStart(e) {
      if (zoom <= 1) return; // 확대 안 했으면 이동할 필요 없음

      setDragging(true);
      setDragStart({ x: e.clientX, y: e.clientY });
      setLastPosition(position);
    }

    function handleDragMove(e) {
      if (!dragging) return;

      const deltaX = e.clientX - dragStart.x;
      const deltaY = e.clientY - dragStart.y;

      setPosition({
        x: lastPosition.x + deltaX,
        y: lastPosition.y + deltaY,
      });
    }

    function handleDragEnd() {
      setDragging(false);
    }

    useEffect(() => {
      if (!dragging) return;

      function onMouseMove(e) {
        handleDragMove(e);
      }

      function onMouseUp() {
        handleDragEnd();
      }

      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);

      return () => {
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
      };
    }, [dragging, dragStart, lastPosition]);

    useEffect(() => {
      const handler = (e) => {
        if (selectedIndex === null) return;

        if (e.key === "Escape") {
          setSelectedIndex(null);
        }

        if (e.key === "ArrowRight") {
          setSelectedIndex((prev) =>
            prev < images.length - 1 ? prev + 1 : prev
          );
        }

        if (e.key === "ArrowLeft") {
          setSelectedIndex((prev) =>
            prev > 0 ? prev - 1 : prev
          );
        }
      };

      window.addEventListener("keydown", handler);
      return () => window.removeEventListener("keydown", handler);
    }, [selectedIndex, images.length]);


    if (!open) return null;

    return (
      <div className="fixed inset-0 z-[180] flex items-center justify-center bg-slate-900/60 px-4 py-6">
        <div className="w-full max-w-3xl rounded-[32px] border border-white/70 bg-white p-6 shadow-[0_30px_90px_rgba(15,23,42,0.28)]">
          <div className="mb-5 flex items-start justify-between gap-3">
            <div>
              <p className="text-lg font-black text-slate-800">쪽지 상세 보기</p>
              <p className="mt-1 text-sm text-slate-500">
                저금통 상태에 맞는 정보만 보여줘요.
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-slate-200 px-3 py-1 text-sm font-bold text-slate-500 transition hover:bg-slate-50"
            >
              닫기
            </button>
          </div>

          {loading && (
            <div className="space-y-3">
              <div className="h-6 w-48 animate-pulse rounded-full bg-slate-200" />
              <div className="h-28 animate-pulse rounded-[24px] bg-slate-100" />
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="h-20 animate-pulse rounded-[24px] bg-slate-100" />
                <div className="h-20 animate-pulse rounded-[24px] bg-slate-100" />
              </div>
            </div>
          )}

          {!loading && error && (
            <div className={`rounded-2xl border border-dashed px-4 py-6 text-center text-sm ${palette.emptyBox}`}>
              <p>{error}</p>

              <button
                type="button"
                onClick={onRetry}
                className={`mt-4 rounded-2xl border px-4 py-2 text-sm font-bold transition ${palette.outlineBtn}`}
              >
                다시 불러오기
              </button>
            </div>
          )}

          {!loading && !error && note && (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-full px-3 py-1 text-xs font-bold ${
                    jar?.isOpen
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-amber-100 text-amber-700"
                  }`}
                >
                  {jar?.isOpen
                    ? "내용 확인 가능"
                    : LOCK_LEVEL_LABEL[jar?.lockLevel] || "잠금 중"}
                </span>

                {note.noteDate && (
                  <span className={`rounded-full px-3 py-1 text-xs font-bold ${palette.countChip}`}>
                    {formatNoteDateOnly(note.noteDate)}
                  </span>
                )}

                {toSafeNoteText(note.location) && (
                  <span className={`rounded-full px-3 py-1 text-xs font-bold ${palette.activeChip}`}>
                    {note.location}
                  </span>
                )}

                <span className={`rounded-full px-3 py-1 text-xs font-bold ${palette.countChip}`}>
                    댓글 {note?.commentCount ?? getTotalCommentCount(comments)}개
                  </span>
              </div>

              <div>
                <h3 className="text-2xl font-black text-slate-800">
                  {toSafeNoteText(note.title) || "제목 없는 추억"}
                </h3>

                <p className="mt-2 text-sm text-slate-500">
                  작성 시간: {formatDate(note.createdAt)}
                </p>
              </div>

              <div className={`rounded-[28px] border p-5 ${palette.panel}`}>
                  {/* 첨부 이미지 */}
                  {Array.isArray(note?.attachments) && note.attachments.length > 0 && (
                    <div className="mt-5">
                      <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
                        첨부 파일
                      </p>

                      <div className="flex flex-wrap gap-3">
                        {note.attachments.map((attachment, index) => {
                          const isImage = attachment.contentType?.startsWith("image/");
                          const isVideo = attachment.contentType?.startsWith("video/");

                          return (
                            <div
                              key={attachment.attachmentId ?? index}
                              className="overflow-hidden rounded-2xl border bg-white"
                            >
                              {isImage ? (
                                <img
                                  src={attachment.thumbnailUrl || attachment.url}
                                  alt={`첨부 이미지 ${index + 1}`}
                                  className="h-32 w-32 cursor-pointer object-cover"
                                  onClick={() => {
                                    setSelectedIndex(index);
                                    setZoom(1);
                                    setPosition({ x: 0, y: 0 });
                                  }}
                                />
                              ) : isVideo ? (
                                <video
                                  src={attachment.url}
                                  controls
                                  className="h-32 w-40 rounded-2xl bg-black"
                                />
                              ) : (
                                <div className="flex h-32 w-32 items-center justify-center text-xs text-slate-500">
                                  미리보기를 지원하지 않는 파일
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
                  내용
                </p>

                <div className={`rounded-2xl border px-4 py-4 text-sm leading-7 text-slate-700 ${palette.infoBox}`}>
                  {hasContent
                    ? note.content
                    : "오픈 전이라 내용이 잠겨 있거나, 아직 공개되지 않은 정보예요."}
                </div>
              </div>

              <ReactionBar
                note={note}
                palette={palette}
                disabled={!jar?.isOpen}
                loading={reacting}
                onReact={onReact}
              />
              <CommentSection
                palette={palette}
                comments={comments}
                loading={commentsLoading}
                error={commentsError}
                currentUserId={currentUserId}
                draft={commentDraft}
                onDraftChange={onCommentDraftChange}
                onCreate={onCreateComment}
                submitting={commentSubmitting}
                editingCommentId={editingCommentId}
                editingContent={editingContent}
                onStartEdit={onStartEditComment}
                onEditChange={onEditCommentChange}
                onCancelEdit={onCancelEditComment}
                onUpdate={onUpdateComment}
                deletingCommentId={deletingCommentId}
                onDelete={onDeleteComment}
                replyTargetCommentId={replyTargetCommentId}
                replyDraftMap={replyDraftMap}
                onToggleReply={onToggleReply}
                onReplyDraftChange={onReplyDraftChange}
                onCreateReply={onCreateReply}
                replyExpandedMap={replyExpandedMap}
                onToggleReplies={onToggleReplies}
                focusedCommentId={focusedCommentId}
              />

              <div className="grid gap-3 sm:grid-cols-2">
                <div className={`rounded-2xl border px-4 py-4 ${palette.infoBox}`}>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                    추억 날짜
                  </p>
                  <p className="text-sm font-semibold text-slate-700">
                    {formatNoteDateOnly(note.noteDate)}
                  </p>
                </div>

                <div className={`rounded-2xl border px-4 py-4 ${palette.infoBox}`}>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                    장소
                  </p>
                  <p className="text-sm font-semibold text-slate-700">
                    {toSafeNoteText(note.location) || "-"}
                  </p>
                </div>
              </div>

              {tags.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                    태그
                  </p>

                  <div className="flex flex-wrap gap-2">
                    {tags.map((tag) => (
                      <span
                        key={tag}
                        className={`rounded-full px-3 py-1 text-xs font-bold ${palette.outlineButton}`}
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        {currentImage && (
          <div
            className="fixed inset-0 z-[999] flex items-center justify-center bg-black/80"
            onClick={() => setSelectedIndex(null)}
          >
            {selectedIndex > 0 && (
              <button
                className="absolute left-6 text-3xl text-white"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedIndex((prev) => prev - 1);
                  setZoom(1);
                  setPosition({ x: 0, y: 0 });
                }}
              >
                ←
              </button>
            )}

            {currentImage.contentType?.startsWith("image/") ? (
              <img
                src={currentImage.url}
                alt="확대 이미지"
                className={`max-h-[80vh] max-w-[90vw] rounded-2xl shadow-lg transition ${
                  dragging ? "cursor-grabbing" : zoom > 1 ? "cursor-grab" : "cursor-default"
                }`}
                style={{
                  transform: `translate(${position.x}px, ${position.y}px) scale(${zoom})`,
                  transition: dragging ? "none" : "transform 0.15s ease-out",
                }}
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  handleDragStart(e);
                }}
                onWheel={(e) => {
                  e.preventDefault();
                  const delta = e.deltaY > 0 ? -0.1 : 0.1;

                  setZoom((z) => {
                    const nextZoom = Math.max(0.5, Math.min(3, z + delta));

                    // 다시 1 이하로 줄어들면 위치 원위치
                    if (nextZoom <= 1) {
                      setPosition({ x: 0, y: 0 });
                    }

                    return nextZoom;
                  });
                }}
              />
            ) : currentImage.contentType?.startsWith("video/") ? (
              <video
                src={currentImage.url}
                controls
                autoPlay
                className="max-h-[80vh] max-w-[90vw] rounded-2xl bg-black shadow-lg"
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <div
                className="rounded-2xl bg-white px-6 py-4 text-sm text-slate-700"
                onClick={(e) => e.stopPropagation()}
              >
                미리보기를 지원하지 않는 파일이에요.
              </div>
            )}

            {selectedIndex < images.length - 1 && (
              <button
                className="absolute right-6 text-3xl text-white"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedIndex((prev) => prev + 1);
                  setZoom(1);
                  setPosition({ x: 0, y: 0 });
                }}
              >
                →
              </button>
            )}

            <button
              className="absolute right-6 top-6 text-xl text-white"
              onClick={() => setSelectedIndex(null)}
            >
              ✕
            </button>
          </div>
        )}
      </div>
    );
  }

function JarZoomModal({
  open,
  jar,
  notes,
  loading,
  error,
  palette,
  onClose,
  onRetry,
  onOpenNoteDetail,
  onReactNote,
  reactingNoteId,
}) {
  if (!open) return null;

  const NOTES_PER_PAGE = 2;

  // 오른쪽 검색창 상태
  const [searchForm, setSearchForm] = useState({
    q: "",
    tag: "",
  });

  // 오른쪽 목록 페이지
  const [notePage, setNotePage] = useState(1);

  // 검색어/태그 기준으로 필터링
  const filteredNotes = useMemo(() => {
    const q = searchForm.q.trim().toLowerCase();
    const tag = searchForm.tag.trim().toLowerCase();

    return notes.filter((note) => {
      const title =
        typeof note?.title === "string" ? note.title.toLowerCase() : "";
      const content =
        typeof note?.content === "string" ? note.content.toLowerCase() : "";
      const location =
        typeof note?.location === "string" ? note.location.toLowerCase() : "";
      const tags = normalizeJarZoomTags(note?.tags).map((item) =>
        item.toLowerCase()
      );

      const matchesQ =
        !q ||
        title.includes(q) ||
        content.includes(q) ||
        location.includes(q);

      const matchesTag =
        !tag || tags.some((item) => item.includes(tag));

      return matchesQ && matchesTag;
    });
  }, [notes, searchForm]);

  // 왼쪽 저금통 안에 보여줄 쪽지도 검색 결과 기준으로 8개만
  const previewNotes = useMemo(() => {
    return filteredNotes.slice(0, 8);
  }, [filteredNotes]);

  // 오른쪽 총 페이지 수
  const notePageCount = useMemo(() => {
    return Math.max(1, Math.ceil(filteredNotes.length / NOTES_PER_PAGE));
  }, [filteredNotes]);

  // 오른쪽 현재 페이지 3개
  const pagedNotes = useMemo(() => {
    const startIndex = (notePage - 1) * NOTES_PER_PAGE;
    return filteredNotes.slice(startIndex, startIndex + NOTES_PER_PAGE);
  }, [filteredNotes, notePage]);

  // 왼쪽 둥둥 떠다니는 쪽지들
  const floatingNotes = useMemo(() => {
    return previewNotes.map((note, index) => {
      const topList = [20, 28, 35, 43, 51, 59, 32, 47];
      const leftList = [18, 47, 30, 56, 22, 50, 40, 62];
      const rotateList = [-12, 9, -7, 11, -9, 8, -5, 10];
      const durationList = [4.8, 5.6, 5.2, 6.0, 4.9, 5.8, 5.1, 6.2];
      const delayList = [0, 0.4, 0.8, 1.1, 0.2, 1.4, 0.6, 1.7];
      const driftXList = [-8, 10, -6, 12, -10, 7, -5, 9];
      const driftYList = [-12, -9, -14, -10, -13, -8, -11, -9];

      return {
        id: note?.noteId ?? note?.id ?? `floating-note-${index}`,
        note,
        top: topList[index % topList.length],
        left: leftList[index % leftList.length],
        rotate: rotateList[index % rotateList.length],
        duration: durationList[index % durationList.length],
        delay: delayList[index % delayList.length],
        driftX: driftXList[index % driftXList.length],
        driftY: driftYList[index % driftYList.length],
      };
    });
  }, [previewNotes]);

  // 모달 새로 열릴 때 검색 초기화 + 첫 페이지
  useEffect(() => {
    if (!open) return;

    setSearchForm({
      q: "",
      tag: "",
    });
    setNotePage(1);
  }, [open]);

  // 검색 결과 바뀌면 1페이지로
  useEffect(() => {
    setNotePage(1);
  }, [searchForm.q, searchForm.tag]);

  // 페이지가 범위 벗어나면 자동 보정
  useEffect(() => {
    if (notePage > notePageCount) {
      setNotePage(notePageCount);
    }
  }, [notePage, notePageCount]);

  function handleResetSearch() {
    setSearchForm({
      q: "",
      tag: "",
    });
  }

  return (
    <div className="fixed inset-0 z-[160] flex items-center justify-center bg-slate-900/55 px-4 py-6">
      <style>
        {`
          @keyframes jarZoomPop {
            0% {
              opacity: 0;
              transform: translateY(18px) scale(0.82);
            }
            100% {
              opacity: 1;
              transform: translateY(0) scale(1);
            }
          }

          .jar-zoom-pop {
            animation: jarZoomPop 280ms cubic-bezier(0.22, 1, 0.36, 1);
          }

          @keyframes floatJarNote {
            0% {
              transform: translate(0, 0) rotate(var(--note-rotate));
            }
            25% {
              transform: translate(calc(var(--drift-x) * 0.6), calc(var(--drift-y) * 0.4))
                rotate(calc(var(--note-rotate) + 4deg));
            }
            50% {
              transform: translate(var(--drift-x), var(--drift-y))
                rotate(calc(var(--note-rotate) - 3deg));
            }
            75% {
              transform: translate(calc(var(--drift-x) * 0.45), calc(var(--drift-y) * 0.65))
                rotate(calc(var(--note-rotate) + 2deg));
            }
            100% {
              transform: translate(0, 0) rotate(var(--note-rotate));
            }
          }

          .jar-floating-note {
            animation-name: floatJarNote;
            animation-timing-function: ease-in-out;
            animation-iteration-count: infinite;
            animation-direction: alternate;
          }

        `}
      </style>

      <div
        className={`jar-zoom-pop w-full max-w-6xl rounded-[34px] border border-white/70 bg-white/95 p-6 shadow-[0_30px_90px_rgba(15,23,42,0.28)] backdrop-blur-sm lg:p-8`}
      >
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <p className="text-lg font-black text-slate-800">
              저금통 안 들여다보기
            </p>
            <p className="mt-1 text-sm text-slate-500">
              화면 가운데에서 저금통을 크게 보고, 안에 쪽지가 얼마나 들어왔는지 확인할 수 있어요.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-200 px-3 py-1 text-sm font-bold text-slate-500 transition hover:bg-slate-50"
          >
            닫기
          </button>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          {/* 왼쪽: 확대 저금통 */}
          <section
            className={`rounded-[30px] border p-6 shadow-sm ${palette.panel}`}
          >
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-3 py-1 text-xs font-bold ${palette.countChip}`}>
                {jar?.isOpen ? "OPEN" : "LOCKED"}
              </span>
              <span className={`rounded-full px-3 py-1 text-xs font-bold ${palette.activeChip}`}>
                쪽지 {notes.length}개
              </span>
            </div>

            <div className="relative mx-auto flex h-[520px] max-w-[430px] items-center justify-center">
              <div
                className={`absolute inset-8 rounded-full blur-3xl ${palette.floating}`}
              />

              {/* 큰 뚜껑 */}
              <div
                className={`absolute top-[86px] z-20 h-14 w-52 rounded-full ${palette.lid} shadow-lg`}
              />
              <div className="absolute top-[103px] z-30 h-3 w-20 rounded-full bg-slate-700/80" />

              {/* 큰 저금통 몸통 */}
              <div
                className={`relative z-10 mt-14 h-[360px] w-[280px] overflow-hidden rounded-[42%_42%_28%_28%] border-[5px] ${palette.jarBody} shadow-[0_24px_60px_rgba(15,23,42,0.16)]`}
              >
                <div className="absolute left-8 top-10 h-40 w-10 rounded-full bg-white/55 blur-sm" />
                <div className="absolute right-10 top-16 h-24 w-5 rounded-full bg-white/38 blur-sm" />

                {/* 저금통 안 쪽지들 */}
                {!loading && !error && floatingNotes.length > 0 && (
                  <div className="absolute inset-0">
                    {floatingNotes.map((item, index) => {
                      const note = item.note;

                      return (
                        <div
                          key={item.id}
                          className="jar-floating-note absolute h-[78px] w-[92px] rounded-[18px] border-2 border-sky-300 bg-white/88 p-2 shadow-[0_10px_22px_rgba(15,23,42,0.12)]"
                          style={{
                            top: `${item.top}%`,
                            left: `${item.left}%`,
                            "--note-rotate": `${item.rotate}deg`,
                            "--drift-x": `${item.driftX}px`,
                            "--drift-y": `${item.driftY}px`,
                            animationDuration: `${item.duration}s`,
                            animationDelay: `${item.delay}s`,
                            transform: `rotate(${item.rotate}deg)`,
                          }}
                        >
                          <div className="absolute right-0 top-0 h-4 w-4 rounded-bl-[10px] border-b-2 border-l-2 border-sky-300 bg-white/80" />

                          <p className="line-clamp-1 pr-2 text-[11px] font-black text-slate-700">
                            {note?.title || "오픈 전 쪽지"}
                          </p>

                          <p className="mt-2 line-clamp-3 text-[10px] leading-4 text-slate-500">
                            {getJarZoomNotePreview(note, jar)}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* 비어 있음 */}
                {!loading && !error && previewNotes.length === 0 && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                    <div className="text-5xl">{getThemeEmoji(jar?.theme)}</div>
                    <div className="rounded-full bg-white/80 px-4 py-2 text-sm font-bold text-slate-700 shadow">
                      아직 쪽지가 없어요
                    </div>
                  </div>
                )}

                {/* 로딩 */}
                {loading && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
                    <div className="h-24 w-24 animate-pulse rounded-full bg-white/60" />
                    <div className="h-5 w-36 animate-pulse rounded-full bg-white/70" />
                  </div>
                )}

                {/* 에러 */}
                {!loading && error && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-6 text-center">
                    <p className="text-sm font-bold text-slate-700">
                      쪽지를 불러오지 못했어요.
                    </p>
                    <p className="text-xs leading-6 text-slate-500">{error}</p>
                    <button
                      type="button"
                      onClick={onRetry}
                      className={`rounded-2xl border px-4 py-2 text-sm font-bold transition ${palette.outlineBtn}`}
                    >
                      다시 불러오기
                    </button>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* 오른쪽: 쪽지 요약 목록 */}
          <aside className={`rounded-[30px] border p-6 shadow-sm ${palette.panel}`}>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-3 py-1 text-xs font-bold ${palette.countChip}`}>
                저금통 이름
              </span>
              <span className="rounded-full bg-white/80 px-3 py-1 text-xs font-bold text-slate-600">
                {jar?.name}
              </span>
            </div>

            <p className="mb-5 text-sm leading-7 text-slate-500">
              오픈 전이면 잠금 정책에 맞는 정보만 보이고, 오픈 후에는 실제 제목이나 내용 일부가 보여요.
            </p>

            <form
              onSubmit={(e) => e.preventDefault()}
              className={`mb-5 rounded-[24px] border p-4 ${palette.panelSoft}`}
            >
              <div className="grid gap-3">
                <input
                  type="text"
                  value={searchForm.q}
                  onChange={(e) =>
                    setSearchForm((prev) => ({ ...prev, q: e.target.value }))
                  }
                  placeholder="제목이나 내용으로 찾아보기"
                  className={`rounded-2xl border px-4 py-3 text-sm font-semibold outline-none transition ${palette.input}`}
                />

                <input
                  type="text"
                  value={searchForm.tag}
                  onChange={(e) =>
                    setSearchForm((prev) => ({ ...prev, tag: e.target.value }))
                  }
                  placeholder="태그로 찾아보기"
                  className={`rounded-2xl border px-4 py-3 text-sm font-semibold outline-none transition ${palette.input}`}
                />

                <div className="flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    className={`rounded-2xl px-4 py-2 text-sm font-bold transition hover:scale-[1.01] ${palette.primaryButton}`}
                  >
                    검색
                  </button>

                  <button
                    type="button"
                    onClick={handleResetSearch}
                    className={`rounded-2xl border px-4 py-2 text-sm font-bold transition ${palette.outlineBtn}`}
                  >
                    초기화
                  </button>
                </div>
              </div>
            </form>
            <div className="mb-4 flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-500">
                검색 결과 {filteredNotes.length}개
              </p>

              {filteredNotes.length !== notes.length && (
                <span className={`rounded-full px-3 py-1 text-[11px] font-bold ${palette.countChip}`}>
                  필터 적용됨
                </span>
              )}
            </div>

            {loading && (
              <div className="space-y-3">
                {[1, 2, 3].map((item) => (
                  <div
                    key={item}
                    className={`animate-pulse rounded-2xl border p-4 ${palette.softCard}`}
                  >
                    <div className="mb-2 h-4 w-24 rounded-full bg-slate-200" />
                    <div className="h-3 w-full rounded-full bg-slate-100" />
                  </div>
                ))}
              </div>
            )}

            {!loading && !error && filteredNotes.length === 0 && (
              <div className={`rounded-2xl border border-dashed px-4 py-6 text-center text-sm ${palette.emptyBox}`}>
                아직 들어간 쪽지가 없어요.
              </div>
            )}

            {!loading && !error && filteredNotes.length > 0 && (
              <>
                <div className="space-y-3">
                  {pagedNotes.map((note, index) => (
                    <button
                      key={note.noteId ?? note.id ?? `${index}-${note.title || "note"}`}
                      type="button"
                      onClick={() => onOpenNoteDetail?.(note.noteId ?? note.id)}
                      className={`w-full rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md ${palette.softCard}`}
                    >
                      {/* 날짜 + 장소 */}
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-3 py-1 text-[11px] font-bold ${palette.activeChip}`}>
                          {note?.noteDate || "날짜 없음"}
                        </span>

                        {note?.location && (
                          <span className={`rounded-full px-3 py-1 text-[11px] font-bold ${palette.countChip}`}>
                            {note.location}
                          </span>
                        )}
                      </div>

                      {/* 제목 */}
                      <p className="text-sm font-black text-slate-800">
                        {note?.title || "오픈 전 쪽지"}
                      </p>

                      {/* 내용 */}
                      <p className="mt-2 text-xs leading-6 text-slate-500">
                        {getJarZoomNotePreview(note, jar)}
                      </p>

                      <ReactionBar
                        note={note}
                        palette={palette}
                        disabled={!jar?.isOpen}
                        loading={reactingNoteId === (note.noteId ?? note.id)}
                        onReact={(emoji) => onReactNote?.(note.noteId ?? note.id, emoji)}
                      />

                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-3 py-1 text-[11px] font-bold ${palette.countChip}`}>
                          💬 댓글 {note?.commentCount ?? 0}
                        </span>
                      </div>

                      {Array.isArray(note.attachments) && note.attachments.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {note.attachments.slice(0, 3).map((attachment, index) => (
                            <span
                              key={`${attachment.s3Key}-${index}`}
                              className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold text-slate-600"
                            >
                              첨부 {index + 1}
                            </span>
                          ))}

                          {note.attachments.length > 3 && (
                            <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold text-slate-600">
                              +{note.attachments.length - 3}
                            </span>
                          )}
                        </div>
                      )}

                      <p className="mt-3 text-[11px] font-semibold text-slate-400">
                        눌러서 상세 보기
                      </p>
                    </button>
                  ))}
                </div>

                {notePageCount > 1 && (
                  <div className="mt-5 flex flex-col gap-3 border-t border-white/60 pt-4 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs font-semibold text-slate-500">
                      {notePage} / {notePageCount} 페이지
                    </p>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setNotePage((prev) => Math.max(1, prev - 1))}
                        disabled={notePage === 1}
                        className={`rounded-2xl border px-4 py-2 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-50 ${palette.outlineBtn}`}
                      >
                        이전
                      </button>

                      {Array.from({ length: notePageCount }, (_, index) => index + 1).map(
                        (pageNumber) => (
                          <button
                            key={pageNumber}
                            type="button"
                            onClick={() => setNotePage(pageNumber)}
                            className={`rounded-2xl px-3 py-2 text-sm font-bold transition ${
                              pageNumber === notePage
                                ? palette.primaryButton
                                : palette.outlineButton
                            }`}
                          >
                            {pageNumber}
                          </button>
                        )
                      )}

                      <button
                        type="button"
                        onClick={() =>
                          setNotePage((prev) => Math.min(notePageCount, prev + 1))
                        }
                        disabled={notePage === notePageCount}
                        className={`rounded-2xl border px-4 py-2 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-50 ${palette.outlineBtn}`}
                      >
                        다음
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}

/*
 * JarChatModal은 저금통 채팅을 모달로 보여주는 컴포넌트야.
 *
 * 역할:
 * - 평소에는 채팅창을 숨김
 * - "저금통 채팅" 버튼을 눌렀을 때만 채팅방을 크게 보여줌
 * - 모달을 닫으면 JarChatPanel도 사라져서 polling도 같이 멈출 수 있음
 *
 * 쉽게 말하면:
 * 화면 아래에 채팅창을 계속 펼쳐두지 않고,
 * 필요할 때만 채팅방을 꺼내 보는 구조야.
 */
function JarChatModal({ open, jar, palette, currentUserId, onClose }) {
  // open이 false면 모달을 아예 만들지 않음
  // 그래서 닫혀 있을 때는 채팅 polling도 돌지 않게 만들 수 있어
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[170] flex items-center justify-center bg-slate-900/55 px-4 py-6"
      onMouseDown={onClose}
    >
      <style>
        {`
          @keyframes jarChatPop {
            0% {
              opacity: 0;
              transform: translateY(18px) scale(0.9);
            }
            100% {
              opacity: 1;
              transform: translateY(0) scale(1);
            }
          }

          .jar-chat-pop {
            animation: jarChatPop 260ms cubic-bezier(0.22, 1, 0.36, 1);
          }
        `}
      </style>

      {/* 모달 본체 */}
      <div
        className="jar-chat-pop flex max-h-[88vh] w-full max-w-4xl flex-col rounded-[34px] border border-white/70 bg-white/95 p-6 shadow-[0_30px_90px_rgba(15,23,42,0.28)] backdrop-blur-sm"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* 모달 상단 */}
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <p className="text-lg font-black text-slate-800">
              저금통 채팅방
            </p>

            <p className="mt-1 text-sm text-slate-500">
              {jar?.name
                ? `${jar.name} 멤버들과 대화할 수 있어요.`
                : "저금통 멤버들과 대화할 수 있어요."}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-200 px-3 py-1 text-sm font-bold text-slate-500 transition hover:bg-slate-50"
          >
            닫기
          </button>
        </div>

        {/* 채팅 영역 */}
        <section
          className={`min-h-0 flex-1 overflow-hidden rounded-[30px] border p-4 shadow-sm ${palette.panel}`}
        >
          <div className="max-h-[68vh] overflow-y-auto rounded-[24px] bg-white/70">
            <JarChatPanel
              jarId={jar?.jarId}
              currentUserId={currentUserId}
            />
          </div>
        </section>
      </div>
    </div>
  );
}

/*
 * JarOpenCelebrationModal 역할
 *
 * 이 컴포넌트는 저금통이 열리는 순간 보여주는 "오픈 축하 연출"이야.
 *
 * 쉽게 말하면:
 * - 화면 주변을 어둡게 만들고
 * - 저금통을 가운데 크게 보여주고
 * - 뚜껑이 열리는 모션을 보여주고
 * - 쪽지와 반짝이가 터지는 느낌을 준다.
 *
 * 이건 실제 데이터를 바꾸는 기능이 아니라,
 * 사용자가 "오! 저금통 열렸다!" 하고 바로 느끼게 만드는 화면 효과야.
 */
function JarOpenCelebrationModal({
  open,
  jar,
  palette,
  event,
  onClose,
  onViewNotes,
}) {
  // open이 false면 화면에 아무것도 만들지 않는다.
  if (!open) return null;

  const themeEmoji = getThemeEmoji(jar?.theme);

  return (
    <div className="fixed inset-0 z-[240] flex items-center justify-center overflow-hidden bg-slate-950/75 px-4 py-6 backdrop-blur-sm">
      <style>
        {`
          @keyframes jarOpenBackdropFade {
            0% {
              opacity: 0;
            }
            100% {
              opacity: 1;
            }
          }

          @keyframes jarOpenStagePop {
            0% {
              opacity: 0;
              transform: translateY(28px) scale(0.72);
              filter: blur(6px);
            }
            55% {
              opacity: 1;
              transform: translateY(-8px) scale(1.05);
              filter: blur(0);
            }
            100% {
              opacity: 1;
              transform: translateY(0) scale(1);
              filter: blur(0);
            }
          }

          @keyframes jarOpenLidFly {
            0% {
              transform: translateY(0) rotate(0deg);
            }
            35% {
              transform: translateY(-12px) rotate(-4deg);
            }
            100% {
              transform: translateY(-95px) translateX(34px) rotate(28deg);
            }
          }

          @keyframes jarOpenBodyBounce {
            0%, 100% {
              transform: translateY(0) scale(1);
            }
            45% {
              transform: translateY(8px) scale(0.98);
            }
            70% {
              transform: translateY(-10px) scale(1.03);
            }
          }

          @keyframes jarOpenGlowPulse {
            0% {
              opacity: 0;
              transform: scale(0.75);
            }
            40% {
              opacity: 1;
              transform: scale(1.08);
            }
            100% {
              opacity: 0.72;
              transform: scale(1);
            }
          }

          @keyframes jarOpenNoteBurst {
            0% {
              opacity: 0;
              transform: translate(0, 40px) rotate(0deg) scale(0.4);
            }
            35% {
              opacity: 1;
            }
            100% {
              opacity: 1;
              transform:
                translate(var(--note-x), var(--note-y))
                rotate(var(--note-rotate))
                scale(1);
            }
          }

          @keyframes jarOpenSparkleBurst {
            0% {
              opacity: 0;
              transform: translate(0, 0) scale(0.3);
            }
            45% {
              opacity: 1;
            }
            100% {
              opacity: 0.95;
              transform:
                translate(var(--sparkle-x), var(--sparkle-y))
                scale(1);
            }
          }

          @keyframes jarOpenTextUp {
            0% {
              opacity: 0;
              transform: translateY(16px);
            }
            100% {
              opacity: 1;
              transform: translateY(0);
            }
          }

          .jar-open-backdrop {
            animation: jarOpenBackdropFade 220ms ease-out both;
          }

          .jar-open-stage {
            animation: jarOpenStagePop 520ms cubic-bezier(0.22, 1, 0.36, 1) both;
          }

          .jar-open-lid {
            animation: jarOpenLidFly 900ms 520ms cubic-bezier(0.2, 1, 0.22, 1) both;
            transform-origin: center;
          }

          .jar-open-body {
            animation: jarOpenBodyBounce 900ms 360ms cubic-bezier(0.22, 1, 0.36, 1) both;
          }

          .jar-open-glow {
            animation: jarOpenGlowPulse 1100ms 420ms ease-out both;
          }

          .jar-open-note {
            animation: jarOpenNoteBurst 950ms 760ms cubic-bezier(0.16, 1, 0.3, 1) both;
          }

          .jar-open-sparkle {
            animation: jarOpenSparkleBurst 900ms 680ms cubic-bezier(0.16, 1, 0.3, 1) both;
          }

          .jar-open-text {
            animation: jarOpenTextUp 500ms 1100ms ease-out both;
          }
        `}
      </style>

      {/* 배경 반짝이 */}
      <div className="jar-open-backdrop pointer-events-none absolute inset-0">
        <div className="absolute left-[12%] top-[18%] h-32 w-32 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute right-[14%] top-[22%] h-40 w-40 rounded-full bg-yellow-200/20 blur-3xl" />
        <div className="absolute bottom-[12%] left-[28%] h-44 w-44 rounded-full bg-emerald-200/15 blur-3xl" />
      </div>

      {/* 가운데 무대 */}
      <div className="jar-open-stage relative w-full max-w-2xl rounded-[38px] border border-white/30 bg-white/95 px-6 py-8 text-center shadow-[0_40px_120px_rgba(0,0,0,0.45)]">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-5 top-5 rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-sm font-black text-slate-500 transition hover:bg-slate-50"
        >
          ✕
        </button>

        <div className="relative mx-auto mb-6 flex h-[360px] max-w-[420px] items-center justify-center">
          {/* 열릴 때 나오는 빛 */}
          <div className={`jar-open-glow absolute h-72 w-72 rounded-full blur-3xl ${palette.floating}`} />
          <div className="jar-open-glow absolute h-52 w-52 rounded-full bg-yellow-200/50 blur-2xl" />

          {/* 터지는 쪽지들 */}
          {[
            { x: "-145px", y: "-120px", r: "-18deg", t: "추억" },
            { x: "-95px", y: "-185px", r: "14deg", t: "사진" },
            { x: "120px", y: "-150px", r: "18deg", t: "쪽지" },
            { x: "155px", y: "-70px", r: "-12deg", t: "기억" },
            { x: "-165px", y: "-25px", r: "10deg", t: "마음" },
            { x: "55px", y: "-215px", r: "-8deg", t: "우리" },
          ].map((note, index) => (
            <div
              key={`${note.t}-${index}`}
              className="jar-open-note absolute left-1/2 top-1/2 z-30 flex h-[70px] w-[88px] items-center justify-center rounded-[18px] border-2 border-sky-300 bg-white/95 text-xs font-black text-slate-700 shadow-[0_14px_30px_rgba(15,23,42,0.22)]"
              style={{
                "--note-x": note.x,
                "--note-y": note.y,
                "--note-rotate": note.r,
              }}
            >
              <span>{note.t}</span>
              <span className="absolute right-0 top-0 h-4 w-4 rounded-bl-[10px] border-b-2 border-l-2 border-sky-300 bg-white" />
            </div>
          ))}

          {/* 터지는 반짝이들 */}
          {[
            { x: "-190px", y: "-160px", icon: "✨" },
            { x: "190px", y: "-145px", icon: "💫" },
            { x: "-210px", y: "10px", icon: "🌟" },
            { x: "205px", y: "20px", icon: "✨" },
            { x: "-50px", y: "-235px", icon: "💛" },
            { x: "75px", y: "-240px", icon: "🌿" },
          ].map((sparkle, index) => (
            <div
              key={`${sparkle.icon}-${index}`}
              className="jar-open-sparkle absolute left-1/2 top-1/2 z-40 text-3xl"
              style={{
                "--sparkle-x": sparkle.x,
                "--sparkle-y": sparkle.y,
              }}
            >
              {sparkle.icon}
            </div>
          ))}

          {/* 저금통 */}
          <div className="relative z-20 mt-16 h-[250px] w-[210px]">
            {/* 뚜껑 */}
            <div
              className={`jar-open-lid absolute left-1/2 top-0 z-30 h-12 w-44 -translate-x-1/2 rounded-full ${palette.lid} shadow-[0_18px_34px_rgba(15,23,42,0.22)]`}
            />
            <div className="jar-open-lid absolute left-1/2 top-[16px] z-40 h-2.5 w-20 -translate-x-1/2 rounded-full bg-slate-700/80" />

            {/* 몸통 */}
            <div
              className={`jar-open-body absolute bottom-0 left-1/2 h-[220px] w-[190px] -translate-x-1/2 rounded-[42%_42%_28%_28%] border-[5px] ${palette.jarBody} shadow-[0_28px_70px_rgba(15,23,42,0.22)]`}
            >
              <div className="absolute left-7 top-8 h-28 w-9 rounded-full bg-white/60 blur-sm" />
              <div className="absolute right-8 top-12 h-20 w-5 rounded-full bg-white/40 blur-sm" />

              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                <div className="text-6xl">{themeEmoji}</div>
                <div className="rounded-full bg-white/85 px-4 py-2 text-sm font-black text-emerald-700 shadow">
                  OPEN
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 안내 문구 */}
        <div className="jar-open-text">
          <p className="text-sm font-black uppercase tracking-[0.28em] text-emerald-500">
            Jar Opened
          </p>

          <h2 className="mt-3 text-3xl font-black text-slate-900 md:text-4xl">
            저금통이 열렸어요!
          </h2>

          <p className="mx-auto mt-4 max-w-md text-sm leading-7 text-slate-500">
            이제 잠겨 있던 추억을 확인할 수 있어요.
            쪽지 목록이 자동으로 새로고침되고, 채팅방에도 오픈 메시지가 남아요.
          </p>

          {event?.openedAt && (
            <p className="mt-3 text-xs font-bold text-slate-400">
              열린 시간: {formatDate(event.openedAt)}
            </p>
          )}

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={onViewNotes}
              className={`rounded-2xl px-5 py-3 text-sm font-black shadow-lg transition hover:scale-[1.03] ${palette.primaryButton}`}
            >
              추억 보러가기
            </button>

            <button
              type="button"
              onClick={onClose}
              className={`rounded-2xl border px-5 py-3 text-sm font-black transition ${palette.outlineButton}`}
            >
              조금 있다 보기
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/*
 * DailyDrawSection
 *
 * 이 컴포넌트는 "오늘의 추억 한 장" UI를 보여주는 역할을 해.
 *
 * 쉽게 말하면:
 * - DAILY_DRAW 방식 저금통에서만 보이고
 * - 저금통이 아직 안 열렸으면 안내문만 보여주고
 * - 열렸는데 오늘 카드가 없으면 "오늘 카드 뽑기" 버튼을 보여주고
 * - 오늘 카드가 있으면 카드 내용과 히스토리를 보여줘.
 */
function DailyDrawSection({
  jar,
  palette,
  today,
  history,
  loading,
  drawing,
  error,
  onDraw,
  onReload,
  onOpenNoteDetail,
  realtimeMessage,
}) {
  // DAILY_DRAW 방식 저금통이 아니면 이 섹션은 아예 보여주지 않는다.
  if (jar?.openMode !== "DAILY_DRAW") {
    return null;
  }

  // 오늘 카드 응답에서 실제 Daily Draw 결과만 꺼낸다.
  const dailyDraw = today?.dailyDraw ?? null;

  // 오늘 뽑힌 쪽지 정보
  const note = dailyDraw?.note ?? null;

  // 오늘 카드에 이미지 첨부가 있으면 대표 이미지로 보여준다.
  const coverImage = Array.isArray(note?.attachments)
    ? note.attachments.find((attachment) =>
        attachment?.contentType?.startsWith("image/")
      )
    : null;

  return (
    <section
      className={`mt-8 rounded-[32px] border p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur-sm ${palette.section}`}
    >
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-black uppercase tracking-[0.22em] text-slate-400">
            Daily Draw
          </p>

          <h2 className="mt-2 text-2xl font-black text-slate-800">
            오늘의 추억 한 장
          </h2>

          <p className="mt-2 text-sm leading-7 text-slate-500">
            저금통이 열린 뒤, 하루에 한 장씩 아직 뽑히지 않은 추억을 랜덤으로 공개해요.
          </p>
        </div>

        <span className={`w-fit rounded-full px-3 py-1 text-xs font-bold ${palette.countChip}`}>
          {jar?.isOpen ? "오늘 카드 확인 가능" : "오픈 전"}
        </span>
      </div>

      {/* Daily Draw 실시간 이벤트 안내 문구 */}
      {jar?.isOpen && realtimeMessage && (
        <div className={`mb-5 rounded-2xl border px-4 py-3 text-sm font-bold ${palette.hintBox}`}>
          ✨ {realtimeMessage}
        </div>
      )}

      {/* 아직 저금통이 열리지 않았을 때 */}
      {!jar?.isOpen && (
        <div className={`rounded-[28px] border border-dashed px-5 py-6 text-sm leading-7 ${palette.emptyBox}`}>
          아직 저금통이 열리지 않았어요.
          오픈 이후부터 하루에 한 장씩 추억 카드를 뽑을 수 있어요.
        </div>
      )}

      {/* 열린 저금통인데 로딩 중일 때 */}
      {jar?.isOpen && loading && (
        <div className="grid gap-4 lg:grid-cols-[1fr_0.8fr]">
          <div className={`animate-pulse rounded-[28px] border p-5 ${palette.softCard}`}>
            <div className="mb-4 h-5 w-40 rounded-full bg-slate-200" />
            <div className="h-32 rounded-[24px] bg-slate-100" />
          </div>

          <div className={`animate-pulse rounded-[28px] border p-5 ${palette.softCard}`}>
            <div className="mb-4 h-5 w-32 rounded-full bg-slate-200" />
            <div className="space-y-3">
              <div className="h-12 rounded-2xl bg-slate-100" />
              <div className="h-12 rounded-2xl bg-slate-100" />
            </div>
          </div>
        </div>
      )}

      {/* 에러 */}
      {jar?.isOpen && !loading && error && (
        <div className={`rounded-[28px] border border-dashed px-5 py-6 text-sm ${palette.emptyBox}`}>
          <p>{error}</p>

          <button
            type="button"
            onClick={onReload}
            className={`mt-4 rounded-2xl border px-4 py-2 text-sm font-bold transition ${palette.outlineBtn}`}
          >
            다시 불러오기
          </button>
        </div>
      )}

      {/* 열린 저금통 + 오늘 카드 없음 */}
      {jar?.isOpen && !loading && !error && !note && (
        <div className={`rounded-[28px] border p-6 text-center ${palette.panel}`}>
          <div className="mb-4 text-5xl">🎁</div>

          <h3 className="text-xl font-black text-slate-800">
            아직 오늘의 추억 한 장이 없어요
          </h3>

          <p className="mx-auto mt-3 max-w-md text-sm leading-7 text-slate-500">
            버튼을 누르면 아직 한 번도 뽑히지 않은 쪽지 중에서 오늘의 카드 1장이 랜덤으로 공개돼요.
          </p>

          <button
            type="button"
            onClick={onDraw}
            disabled={drawing}
            className={`mt-5 rounded-2xl px-5 py-3 text-sm font-black shadow-md transition hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-60 ${palette.primaryButton}`}
          >
            {drawing ? "오늘 카드 뽑는 중..." : "오늘의 추억 한 장 뽑기"}
          </button>
        </div>
      )}

      {/* 열린 저금통 + 오늘 카드 있음 */}
      {jar?.isOpen && !loading && !error && note && (
        <div className="grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
          {/* 오늘 카드 */}
          <article className={`overflow-hidden rounded-[30px] border ${palette.panel}`}>
            {coverImage ? (
              <img
                src={coverImage.thumbnailUrl || coverImage.url}
                alt={note.title || "오늘의 추억 이미지"}
                className="h-56 w-full object-cover"
              />
            ) : (
              <div className={`flex h-56 items-center justify-center ${palette.infoBox}`}>
                <div className="text-center">
                  <div className="mb-3 text-5xl">💌</div>
                  <p className="text-sm font-bold text-slate-500">
                    이미지 없이 공개된 추억이에요
                  </p>
                </div>
              </div>
            )}

            <div className="p-5">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-3 py-1 text-xs font-bold ${palette.countChip}`}>
                  {dailyDraw.drawDate}
                </span>

                {note.noteDate && (
                  <span className={`rounded-full px-3 py-1 text-xs font-bold ${palette.activeChip}`}>
                    추억 날짜 {formatNoteDateOnly(note.noteDate)}
                  </span>
                )}

                {note.location && (
                  <span className={`rounded-full px-3 py-1 text-xs font-bold ${palette.countChip}`}>
                    {note.location}
                  </span>
                )}
              </div>

              <h3 className="text-2xl font-black text-slate-800">
                {note.title || "제목 없는 추억"}
              </h3>

              <p className="mt-3 line-clamp-4 text-sm leading-7 text-slate-600">
                {note.content || "내용이 없는 추억이에요."}
              </p>

              <p className="mt-3 text-xs font-bold text-slate-400">
                작성자: {note.authorName || `사용자 ${note.authorId}`}
              </p>

              <div className="mt-5 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => onOpenNoteDetail?.(note.noteId)}
                  className={`rounded-2xl px-4 py-2 text-sm font-bold shadow-sm transition hover:scale-[1.01] ${palette.primaryButton}`}
                >
                  오늘 카드 자세히 보기
                </button>

                <button
                  type="button"
                  onClick={onReload}
                  className={`rounded-2xl border px-4 py-2 text-sm font-bold transition ${palette.outlineButton}`}
                >
                  새로고침
                </button>
              </div>
            </div>
          </article>

          {/* 히스토리 */}
          <aside className={`rounded-[30px] border p-5 ${palette.panel}`}>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-black text-slate-800">
                  공개 기록
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  지금까지 뽑힌 추억 카드들이에요.
                </p>
              </div>

              <span className={`rounded-full px-3 py-1 text-xs font-bold ${palette.countChip}`}>
                {history.length}개
              </span>
            </div>

            {history.length === 0 && (
              <div className={`rounded-2xl border border-dashed px-4 py-6 text-center text-sm ${palette.emptyBox}`}>
                아직 공개 기록이 없어요.
              </div>
            )}

            {history.length > 0 && (
              <div className="space-y-3">
                {history.slice(0, 5).map((item) => (
                  <button
                    key={item.drawId}
                    type="button"
                    onClick={() => onOpenNoteDetail?.(item.noteId)}
                    className={`w-full rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md ${palette.softCard}`}
                  >
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-3 py-1 text-[11px] font-bold ${palette.activeChip}`}>
                        {item.drawDate}
                      </span>

                      {item.noteDate && (
                        <span className={`rounded-full px-3 py-1 text-[11px] font-bold ${palette.countChip}`}>
                          {formatNoteDateOnly(item.noteDate)}
                        </span>
                      )}
                    </div>

                    <p className="text-sm font-black text-slate-800">
                      {item.title || "제목 없는 추억"}
                    </p>

                    <p className="mt-1 text-xs text-slate-500">
                      {item.authorName || `사용자 ${item.authorId}`}
                      {item.location ? ` · ${item.location}` : ""}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </aside>
        </div>
      )}
    </section>
  );
}

function InfoItem({ label, value, className = "" }) {
  return (
    <div className={`rounded-2xl border px-4 py-3 ${className}`}>
      <p className="mb-1 text-xs font-semibold tracking-wide text-slate-400 uppercase">
        {label}
      </p>
      <p className="text-sm font-semibold text-slate-700">{value || "-"}</p>
    </div>
  );
}

// 초대코드 상태를 판단해서, 각 저금통 테마에 맞는 색까지 같이 돌려주는 함수
function getInviteStatus(invite, palette) {
  if (!invite) {
    return {
      label: "확인 중",
      className: "bg-slate-100 text-slate-600",
    };
  }

  // 관리자가 직접 폐기한 코드
  if (invite.revokedAt) {
    return {
      label: "폐기됨",
      className: palette.inviteStatusRevoked,
    };
  }

  // 최대 사용 횟수를 다 채운 코드
  if (invite.usedCount >= invite.maxUses) {
    return {
      label: "사용 완료",
      className: palette.inviteStatusUsed,
    };
  }

  // 시간이 지나서 만료된 코드
  if (invite.expiresAt && new Date(invite.expiresAt).getTime() < Date.now()) {
    return {
      label: "만료됨",
      className: palette.inviteStatusExpired,
    };
  }

  // 지금 바로 사용할 수 있는 코드
  if (invite.isActive) {
    return {
      label: "사용 가능",
      className: palette.inviteStatusActive,
    };
  }

  return {
    label: "종료됨",
    className: "bg-slate-100 text-slate-600",
  };
}

export default function JarDetailPage() {


  // 지금 어떤 댓글 아래에 답글 입력창을 열었는지 저장
  const [replyTargetCommentId, setReplyTargetCommentId] = useState(null);

  // 댓글별 답글 입력값 저장
  // 예:
  // {
  //   10: "첫 번째 댓글에 쓰는 답글",
  //   20: "두 번째 댓글에 쓰는 답글"
  // }
  const [replyDraftMap, setReplyDraftMap] = useState({});

  // 어떤 댓글의 답글 목록을 펼쳐서 보고 있는지 저장
  const [replyExpandedMap, setReplyExpandedMap] = useState({});

  // 현재 로그인 사용자 정보
  const [me, setMe] = useState(null);

  // 현재 상세 모달에서 보고 있는 댓글 목록
  const [jarZoomComments, setJarZoomComments] = useState([]);

  // 댓글 로딩 / 에러
  const [jarZoomCommentsLoading, setJarZoomCommentsLoading] = useState(false);
  const [jarZoomCommentsError, setJarZoomCommentsError] = useState("");

  // 새 댓글 입력창 값
  const [commentDraft, setCommentDraft] = useState("");

  // 댓글 등록 / 수정 공통 저장 로딩
  const [commentSubmitting, setCommentSubmitting] = useState(false);

  // 지금 수정 중인 댓글 id
  const [editingCommentId, setEditingCommentId] = useState(null);

  // 수정 textarea 값
  const [editingContent, setEditingContent] = useState("");

  // 삭제 중인 댓글 id
  const [deletingCommentId, setDeletingCommentId] = useState(null);

  // 주소에서 jarId 꺼내기
  const { jarId } = useParams();

  // 현재 페이지로 넘어올 때 함께 전달된 state 읽기
    const location = useLocation();

  // 페이지 이동용
  const navigate = useNavigate();

  // 서버에서 받아온 상세 정보 저장
  const [jar, setJar] = useState(null);

  // 상세 로딩 / 에러
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

    // 알림에서 들어왔을 때 어느 댓글을 강조할지 저장
    const [focusedCommentId, setFocusedCommentId] = useState(null);

    // 아직 스크롤/강조 처리 전인 댓글 id
    const [pendingFocusCommentId, setPendingFocusCommentId] = useState(null);

    // 같은 location state를 여러 번 처리하지 않도록 막는 ref
    const handledNotificationLocationKeyRef = useRef(null);

  // 삭제 버튼 눌렀을 때 따로 로딩 표시
  const [deleteLoading, setDeleteLoading] = useState(false);

  // NoteSection에게 보내는 열기 신호
  const [noteCreateRequestId, setNoteCreateRequestId] = useState(0);

  // 다음 단계에서 쪽지가 저금통으로 들어가는 좌표 잡을 때 쓸 준비물
  const jarVisualRef = useRef(null);

  // 멤버 목록 상태
  const [members, setMembers] = useState([]);
  const [membersLoading, setMembersLoading] = useState(true);
  const [membersError, setMembersError] = useState("");

  // 초대 목록 상태
  const [invites, setInvites] = useState([]);
  const [invitesLoading, setInvitesLoading] = useState(false);
  const [invitesError, setInvitesError] = useState("");

  // 초대 생성 폼 상태
  const [inviteForm, setInviteForm] = useState({
    expiresInHours: "24",
    maxUses: "1",
  });

  const [createInviteLoading, setCreateInviteLoading] = useState(false);
  const [revokeLoadingId, setRevokeLoadingId] = useState(null);
  const [roleUpdateLoadingId, setRoleUpdateLoadingId] = useState(null);
  const [kickLoadingId, setKickLoadingId] = useState(null);
  const [leaveLoading, setLeaveLoading] = useState(false);

  const [jarZoomDetailOpen, setJarZoomDetailOpen] = useState(false);
  const [jarZoomDetailNoteId, setJarZoomDetailNoteId] = useState(null);
  const [jarZoomDetailNote, setJarZoomDetailNote] = useState(null);
  const [jarZoomDetailLoading, setJarZoomDetailLoading] = useState(false);
  const [jarZoomDetailError, setJarZoomDetailError] = useState("");

  // 저금통 확대 보기 모달 상태
  const [jarZoomOpen, setJarZoomOpen] = useState(false);
  const [jarZoomNotes, setJarZoomNotes] = useState([]);
  const [jarZoomLoading, setJarZoomLoading] = useState(false);
  const [jarZoomError, setJarZoomError] = useState("");

  const [dailyDrawToday, setDailyDrawToday] = useState(null);
  const [dailyDrawHistory, setDailyDrawHistory] = useState([]);
  const [dailyDrawLoading, setDailyDrawLoading] = useState(false);
  const [dailyDrawDrawing, setDailyDrawDrawing] = useState(false);
  const [dailyDrawError, setDailyDrawError] = useState("");

  // Daily Draw WebSocket 이벤트를 받았을 때 잠깐 보여줄 안내 문구
  const [dailyDrawRealtimeMessage, setDailyDrawRealtimeMessage] = useState("");

  // 안내 문구를 몇 초 뒤 자동으로 지울 때 사용할 타이머 보관함
  const dailyDrawRealtimeMessageTimerRef = useRef(null);

  // 저금통 채팅 모달 상태
  // false면 닫힘, true면 열림
  const [jarChatOpen, setJarChatOpen] = useState(false);

  // 저금통 오픈 축하 모달 상태
  // 서버에서 JAR_OPENED 이벤트가 오면 true로 바뀌고, 화면 가운데 오픈 연출이 뜬다.
  const [jarOpenCelebrationOpen, setJarOpenCelebrationOpen] = useState(false);

  // 방금 받은 저금통 오픈 이벤트 정보를 저장한다.
  // 예: { jarId, eventType: "JAR_OPENED", isOpen: true, openedAt, message }
  const [jarOpenCelebrationEvent, setJarOpenCelebrationEvent] = useState(null);

  // NoteSection을 강제로 다시 그리기 위한 숫자다.
  // 저금통이 열리면 오픈 전 마스킹된 쪽지 목록을 새로 불러오게 하려고 사용한다.
  const [noteSectionRefreshKey, setNoteSectionRefreshKey] = useState(0);

  // 오픈 축하 모달을 몇 초 뒤 자동으로 닫을 때 사용할 타이머 보관함이다.
  const jarOpenCelebrationTimerRef = useRef(null);

  // 채팅방 밖에서 보여줄 안 읽은 채팅 개수
  const [chatUnreadCount, setChatUnreadCount] = useState(0);

  const [jarZoomReactingNoteId, setJarZoomReactingNoteId] = useState(null);

  // 초대코드 목록은 2개씩 페이지처럼 보여줄 거야.
  const [invitePage, setInvitePage] = useState(1);

    // 사용자가 화면에서 숨긴 폐기 코드 id 목록
    const [hiddenInviteIds, setHiddenInviteIds] = useState([]);

    // localStorage에서 숨김 목록을 다 읽었는지 표시하는 값
    const [hiddenInvitesReady, setHiddenInvitesReady] = useState(false);

    // 설정 수정 모달 상태
    const [editOpen, setEditOpen] = useState(false);
    const [editLoading, setEditLoading] = useState(false);

    // 수정 폼 상태
    const [editForm, setEditForm] = useState({
      name: "",
      description: "",
      // 새 기본값은 라벤더로 둔다.
      theme: "LAVENDER",
      maxMembers: "2",
      openMode: "ALL_AT_ONCE",
      lockLevel: "HIDDEN",
      openAt: "",
    });


  // 저금통마다 숨김 목록을 따로 저장하려고 key를 jarId 기준으로 만들어줘.
  const hiddenInviteStorageKey = `jar-detail-hidden-revoked-invites:${jarId}`;

  // 상세 데이터 불러오기
  async function loadJarDetail({ silent = false } = {}) {
    // silent가 false일 때만 전체 화면 로딩을 켠다.
    // 실시간 이벤트로 조용히 갱신할 때는 화면 전체를 깜빡이게 하지 않기 위해서다.
    if (!silent) {
      setLoading(true);
    }

    setError("");

    try {
      const res = await apiClient.get(`/api/v1/jars/${jarId}`);
      const data = res.data?.data;
      setJar(data || null);
    } catch (e) {
      const serverMessage =
        e?.response?.data?.error?.message ||
        e?.response?.data?.message ||
        e?.message ||
        "저금통 정보를 불러오지 못했어요.";

      setError(serverMessage);
      setJar(null);
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }

  // 멤버 목록 불러오기
  async function loadMembers() {
    setMembersLoading(true);
    setMembersError("");

    try {
      const res = await apiClient.get(`/api/v1/jars/${jarId}/members`);
      const items = res.data?.data?.items || [];
      setMembers(items);
    } catch (e) {
      const serverMessage =
        e?.response?.data?.error?.message ||
        e?.response?.data?.message ||
        e?.message ||
        "멤버 목록을 불러오지 못했어요.";

      setMembersError(serverMessage);
      setMembers([]);
    } finally {
      setMembersLoading(false);
    }
  }

  async function loadMe() {
    try {
      const res = await apiClient.get("/api/v1/me");
      setMe(res.data?.data || null);
    } catch {
      setMe(null);
    }
  }

  // 초대 목록 불러오기
  async function loadInvites() {
    setInvitesLoading(true);
    setInvitesError("");

    try {
      const res = await apiClient.get(`/api/v1/jars/${jarId}/invites`);
      const items = res.data?.data?.items || [];
      setInvites(items);
      // 이미 서버에 없어진 코드나, 폐기 상태가 아닌 코드는 숨김 목록에서 정리해줘.
            setHiddenInviteIds((prev) =>
              prev.filter((hiddenId) =>
                items.some(
                  (invite) =>
                    Number(invite.inviteId) === Number(hiddenId) && invite.revokedAt
                )
              )
            );
    } catch (e) {
      const serverMessage =
        e?.response?.data?.error?.message ||
        e?.response?.data?.message ||
        e?.message ||
        "초대 목록을 불러오지 못했어요.";

      setInvitesError(serverMessage);
      setInvites([]);
    } finally {
      setInvitesLoading(false);
    }
  }

  // 페이지 열리면 상세 + 멤버 목록 로드
  useEffect(() => {
    loadJarDetail();
    loadMembers();
    loadMe();
  }, [jarId]);

  /*
   * 저금통 멤버 변화 WebSocket 연결
   *
   * 누가 들어오거나, 나가거나, 강퇴되거나, 역할이 바뀌면
   * 현재 저금통 상세 화면을 보고 있는 사람들의 멤버 목록/상세 정보를 자동 갱신한다.
   */
  useEffect(() => {
    if (!jarId) return;

    const currentUserId = getCurrentUserIdFromMe(me);

    // 아직 내 정보가 없으면 WebSocket 연결을 만들지 않는다.
    // 이유: 내가 강퇴/나가기 대상인지 정확히 판단하려면 내 userId가 필요하기 때문.
    if (!currentUserId) return;

    const client = createJarMemberSocketClient({
      jarId,

      onMemberEventReceived: async (event) => {
        const eventType = event?.type;
        const targetUserId = Number(event?.targetUserId);

        /*
         * 내가 강퇴된 경우:
         * - 더 이상 이 저금통을 볼 권한이 없으니
         * - 상세 정보를 다시 불러오지 말고 바로 목록으로 보낸다.
         */
        if (
          (eventType === "MEMBER_KICKED" || eventType === "MEMBER_LEFT") &&
          targetUserId === currentUserId
        ) {
          if (eventType === "MEMBER_KICKED") {
            window.alert("이 저금통에서 내보내졌어요.");
          }

          navigate("/jars", { replace: true });
          return;
        }

        /*
         * 다른 사람이 들어오거나, 나가거나, 역할이 바뀐 경우:
         * - 멤버 목록 갱신
         * - 인원 수, 내 역할 등 상세 정보 갱신
         */
        await Promise.allSettled([
          loadMembers(),
          loadJarDetail({ silent: true }),
        ]);
      },

      onConnect: () => {
        console.log("저금통 멤버 변화 구독 시작");
      },

      onError: (error) => {
        console.error("저금통 멤버 WebSocket 오류", error);
      },
    });

    client.activate();

    return () => {
      disconnectJarMemberSocket(client);
    };
  }, [jarId, me?.userId, me?.id, navigate]);


  /*
   * 저금통 오픈 WebSocket 연결
   *
   * 역할:
   * - 서버가 /topic/jars/{jarId}/open 으로 보내는 JAR_OPENED 이벤트를 받는다.
   * - 이벤트를 받으면 화면을 새로고침하지 않고 OPEN 상태로 바꾼다.
   * - 쪽지 목록을 다시 불러와서 오픈 전 마스킹을 풀 준비를 한다.
   * - 가운데에 저금통 오픈 축하 모달을 띄운다.
   */
  useEffect(() => {
    // jarId가 없으면 어떤 저금통을 구독할지 모르니까 연결하지 않는다.
    if (!jarId) return;

    const client = createJarOpenSocketClient({
      jarId,

      onJarOpened: async (event) => {
        console.log("저금통 오픈 이벤트 수신", event);

        // 1. 기존 자동 닫힘 타이머가 있으면 먼저 정리한다.
        // 같은 이벤트가 아주 드물게 중복으로 와도 타이머가 꼬이지 않게 하기 위함이다.
        if (jarOpenCelebrationTimerRef.current) {
          window.clearTimeout(jarOpenCelebrationTimerRef.current);
        }

        // 2. 화면의 저금통 상태를 즉시 OPEN으로 바꾼다.
        // API 재조회가 끝나기 전에도 상단 뱃지와 상태 문구가 바로 바뀐다.
        setJar((prev) => {
          if (!prev) return prev;

          return {
            ...prev,
            isOpen: true,
          };
        });

        // 3. NoteSection을 다시 마운트해서 쪽지 목록을 새로 불러오게 한다.
        // 오픈 전에는 잠겨 있던 내용이 오픈 후에는 보여야 하기 때문이다.
        setNoteSectionRefreshKey((prev) => prev + 1);

        // 4. 오픈 축하 모달을 띄운다.
        setJarOpenCelebrationEvent(event);
        setJarOpenCelebrationOpen(true);

        // 5. 서버 기준 최신 상세/쪽지 정보를 다시 맞춘다.
        // 실패해도 화면 전체를 깨지 않도록 Promise.allSettled를 사용한다.
        await Promise.allSettled([
          loadJarDetail({ silent: true }),
          loadJarZoomNotes(),
        ]);

        // 6. 만약 사용자가 이미 쪽지 상세 모달을 보고 있었다면
        // 해당 쪽지도 다시 불러와서 잠금 상태를 최신으로 맞춘다.
        if (jarZoomDetailOpen && jarZoomDetailNoteId) {
          await handleOpenJarZoomNoteDetail(jarZoomDetailNoteId);
        }
      },

      onConnect: () => {
        console.log("저금통 오픈 이벤트 구독 시작");
      },

      onError: (error) => {
        console.error("저금통 오픈 WebSocket 오류", error);
      },
    });

    client.activate();

    return () => {
      disconnectJarOpenSocket(client);

      if (jarOpenCelebrationTimerRef.current) {
        window.clearTimeout(jarOpenCelebrationTimerRef.current);
      }
    };
  }, [jarId, jarZoomDetailOpen, jarZoomDetailNoteId]);

  /*
   * 쪽지 상세 모달 WebSocket 연결
   *
   * 언제 연결하냐면?
   * - 저금통 확대 모달에서 특정 쪽지 상세 모달을 열었을 때만 연결한다.
   *
   * 왜 항상 연결하지 않냐면?
   * - 모든 쪽지를 전부 구독하면 연결이 너무 많아진다.
   * - 지금 보고 있는 쪽지 하나만 구독하는 게 깔끔하다.
   */
  useEffect(() => {
    // 쪽지 상세 모달이 닫혀 있으면 연결하지 않는다.
    if (!jarZoomDetailOpen) return;

    // 어떤 쪽지를 보고 있는지 없으면 연결하지 않는다.
    if (!jarId || !jarZoomDetailNoteId) return;

    const client = createNoteSocketClient({
      jarId,
      noteId: jarZoomDetailNoteId,

      onNoteEventReceived: async (event) => {
        const eventType = event?.type;
        const eventNoteId = Number(event?.noteId);

        // 혹시 다른 쪽지 이벤트가 들어오면 무시한다.
        if (!eventNoteId || eventNoteId !== Number(jarZoomDetailNoteId)) {
          return;
        }

        /*
         * 댓글/답글/수정/삭제 이벤트
         *
         * 처음 버전에서는 event 내용으로 직접 화면을 조작하지 않고,
         * 댓글 목록을 다시 조회한다.
         *
         * 이유:
         * - 부모 댓글/답글 트리 구조를 안전하게 맞출 수 있다.
         * - 삭제/수정 후 정렬도 서버 기준과 정확히 맞는다.
         */
        if (
          eventType === "COMMENT_CREATED" ||
          eventType === "COMMENT_REPLIED" ||
          eventType === "COMMENT_UPDATED" ||
          eventType === "COMMENT_DELETED"
        ) {
          const refreshedComments = await loadJarZoomComments(eventNoteId);
          patchCommentCountEverywhere(
            eventNoteId,
            getTotalCommentCount(refreshedComments)
          );
          return;
        }

        /*
         * 리액션 이벤트
         *
         * 주의:
         * WebSocket 이벤트에 들어있는 actorUserId는 "누가 눌렀는지"이고,
         * myReaction은 사용자마다 다르다.
         *
         * 그래서 이벤트를 받으면 각 사용자가 자기 기준으로
         * GET /reactions를 다시 조회해야 한다.
         */
        if (eventType === "REACTION_CHANGED") {
          const res = await apiClient.get(
            `/api/v1/jars/${jarId}/notes/${eventNoteId}/reactions`
          );

          const summary = res.data?.data;

          patchJarZoomDetailNote(eventNoteId, summary);
          patchJarZoomNoteInList(eventNoteId, summary);
        }
      },

      onConnect: () => {
        console.log("쪽지 상세 변화 구독 시작");
      },

      onError: (error) => {
        console.error("쪽지 상세 WebSocket 오류", error);
      },
    });

    client.activate();

    return () => {
      disconnectNoteSocket(client);
    };
  }, [jarId, jarZoomDetailOpen, jarZoomDetailNoteId]);

  // 알림에서 /jars/:jarId 로 들어왔을 때
  // 1) 저금통 확대 모달 열고
  // 2) 해당 쪽지 상세 모달 열고
  // 3) 필요하면 특정 댓글까지 찾는 흐름
  useEffect(() => {
    const fromNotification = !!location.state?.fromNotification;
    const focusNoteId = location.state?.focusNoteId
      ? Number(location.state.focusNoteId)
      : null;
    const focusCommentId = location.state?.focusCommentId
      ? Number(location.state.focusCommentId)
      : null;

    if (!jar) return;
    if (!fromNotification) return;
    if (!focusNoteId) return;

    // 같은 navigation entry는 한 번만 처리
    if (handledNotificationLocationKeyRef.current === location.key) {
      return;
    }

    handledNotificationLocationKeyRef.current = location.key;

    async function openFromNotification() {
      // 저금통 확대 모달 먼저 열기
      setJarZoomOpen(true);

      // 오른쪽 목록도 같이 채워두면 화면이 자연스러워
      await loadJarZoomNotes();

      // 쪽지 상세 열기 + 필요하면 댓글 포커스 정보도 같이 넘기기
      await handleOpenJarZoomNoteDetail(focusNoteId, {
        focusCommentId,
      });
    }

    openFromNotification();
  }, [jar, location.key, location.state]);

  // 댓글 목록이 준비되면
  // - 목표 댓글이 대댓글인지 찾아서 부모 답글 목록을 펼치고
  // - 그 댓글 위치로 스크롤하고
  // - 잠깐 강조해줘
  useEffect(() => {
    if (!jarZoomDetailOpen) return;
    if (!pendingFocusCommentId) return;
    if (jarZoomCommentsLoading) return;
    if (!Array.isArray(jarZoomComments) || jarZoomComments.length === 0) return;

    const path = findCommentPath(jarZoomComments, pendingFocusCommentId);

    // 못 찾았으면 무한 대기하지 않게 정리
    if (!path) {
      setPendingFocusCommentId(null);
      return;
    }

    // 마지막은 진짜 target 댓글이고,
    // 앞쪽 id들은 "이 댓글을 보려면 펼쳐야 하는 부모 댓글"이야.
    const parentIdsToExpand = path.slice(0, -1);

    if (parentIdsToExpand.length > 0) {
      setReplyExpandedMap((prev) => {
        const next = { ...prev };

        parentIdsToExpand.forEach((commentId) => {
          next[commentId] = true;
        });

        return next;
      });
    }

    const targetId = Number(pendingFocusCommentId);

    const scrollTimer = window.setTimeout(() => {
      const targetElement = document.getElementById(`jar-comment-${targetId}`);

      if (targetElement) {
        targetElement.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      }

      setFocusedCommentId(targetId);
    }, 180);

    const clearHighlightTimer = window.setTimeout(() => {
      setFocusedCommentId((prev) =>
        Number(prev) === targetId ? null : prev
      );
    }, 2600);

    setPendingFocusCommentId(null);

    return () => {
      window.clearTimeout(scrollTimer);
      window.clearTimeout(clearHighlightTimer);
    };
  }, [
    jarZoomDetailOpen,
    jarZoomComments,
    jarZoomCommentsLoading,
    pendingFocusCommentId,
  ]);

  /*
   * 채팅 모달이 닫혀 있을 때도
   * 채팅 버튼 옆 숫자는 계속 갱신되어야 해.
   *
   * 그래서 JarChatPanel이 사라져 있어도
   * JarDetailPage에서 unread count만 가볍게 polling 해준다.
   */
  useEffect(() => {
    if (!jarId) return;

    // 처음 들어왔을 때 1번 바로 조회
    loadChatUnreadCount();

    // 채팅 모달이 열려 있으면 JarChatPanel이 직접 메시지를 보고 읽음 처리하므로
    // 바깥 badge polling은 잠깐 멈춰도 괜찮아.
    if (jarChatOpen) return;

    const timerId = window.setInterval(() => {
      loadChatUnreadCount();
    }, 3000);

    return () => {
      window.clearInterval(timerId);
    };
  }, [jarId, jarChatOpen]);

  /*
   * Daily Draw 자동 조회
   *
   * 역할:
   * - 저금통 상세 정보가 로드된 뒤
   * - openMode가 DAILY_DRAW이고
   * - 저금통이 열린 상태라면
   * 오늘 카드와 히스토리를 자동으로 불러온다.
   */
  useEffect(() => {
    if (!jarId || !jar) return;

    // DAILY_DRAW 방식이 아니면 Daily Draw 상태를 비운다.
    if (jar.openMode !== "DAILY_DRAW") {
      setDailyDrawToday(null);
      setDailyDrawHistory([]);
      setDailyDrawError("");
      setDailyDrawLoading(false);
      return;
    }

    // DAILY_DRAW이지만 아직 열리지 않았다면 API를 호출하지 않는다.
    // 백엔드가 "아직 열리지 않음"으로 막을 것이기 때문이다.
    if (!jar.isOpen) {
      setDailyDrawToday(null);
      setDailyDrawHistory([]);
      setDailyDrawError("");
      setDailyDrawLoading(false);
      return;
    }

    refreshDailyDraw();
  }, [jarId, jar?.openMode, jar?.isOpen]);

  /*
   * Daily Draw WebSocket 연결
   *
   * 역할:
   * - 같은 저금통을 보고 있는 다른 멤버가 "오늘의 추억 한 장"을 뽑으면
   * - 서버가 /topic/jars/{jarId}/daily-draw 로 이벤트를 보내준다.
   * - 프론트는 그 이벤트를 받고 오늘 카드/히스토리를 다시 조회해서
   *   새로고침 없이 화면을 최신 상태로 맞춘다.
   *
   * 중요한 점:
   * - WebSocket 이벤트에는 "오늘 카드가 공개됐다"는 소식만 담는다.
   * - 실제 카드 내용은 기존 REST API로 다시 가져온다.
   * - 그래야 기존 권한 검증 로직을 그대로 재사용할 수 있어서 더 안전하다.
   */
  useEffect(() => {
    // jarId가 없으면 어떤 저금통을 구독할지 모르니까 연결하지 않는다.
    if (!jarId) return;

    // 저금통 상세 정보가 아직 없으면 연결하지 않는다.
    if (!jar) return;

    // DAILY_DRAW 방식 저금통에서만 Daily Draw 이벤트를 구독한다.
    if (jar.openMode !== "DAILY_DRAW") return;

    // 아직 열리지 않은 저금통이면 오늘 카드를 뽑을 수 없으므로 구독하지 않는다.
    if (!jar.isOpen) return;

    const client = createDailyDrawSocketClient({
      jarId,

      onDailyDrawRevealed: async (event) => {
        console.log("Daily Draw 공개 이벤트 수신", event);

        /*
         * 1. 안내 문구를 잠깐 보여준다.
         *
         * A 사용자가 뽑은 경우에도 A 화면에 이벤트가 다시 올 수 있고,
         * B/C 같은 다른 멤버 화면에도 이벤트가 온다.
         *
         * 그래서 문구는 너무 강한 alert가 아니라
         * 화면 안의 작은 안내 박스로만 보여준다.
         */
        setDailyDrawRealtimeMessage(
          event?.message || "오늘의 추억 한 장이 공개되어 화면을 최신으로 맞췄어요."
        );

        // 기존 타이머가 있으면 먼저 정리한다.
        if (dailyDrawRealtimeMessageTimerRef.current) {
          window.clearTimeout(dailyDrawRealtimeMessageTimerRef.current);
        }

        // 4초 뒤 안내 문구를 자동으로 지운다.
        dailyDrawRealtimeMessageTimerRef.current = window.setTimeout(() => {
          setDailyDrawRealtimeMessage("");
        }, 4000);

        /*
         * 2. 오늘 카드와 히스토리를 다시 조회한다.
         *
         * WebSocket 이벤트 payload에 카드 본문을 담지 않았기 때문에
         * 기존 REST API를 다시 호출해서 서버 기준 최신 데이터를 가져온다.
         */
        await Promise.allSettled([
          loadDailyDrawToday({ silent: true }),
          loadDailyDrawHistory({ silent: true }),
        ]);

        /*
         * 3. 저금통 확대 모달의 쪽지 목록도 최신화한다.
         *
         * 이미 모달을 열어둔 상태라면 오른쪽 쪽지 목록도 자연스럽게 최신 상태가 된다.
         * 모달이 닫혀 있어도 큰 문제는 없지만, 다음에 열었을 때 더 최신 상태가 될 수 있다.
         */
        await loadJarZoomNotes();
      },

      onConnect: () => {
        console.log("Daily Draw 이벤트 구독 시작");
      },

      onError: (error) => {
        console.error("Daily Draw WebSocket 오류", error);
      },
    });

    client.activate();

    return () => {
      disconnectDailyDrawSocket(client);

      // 페이지를 벗어나거나 구독 조건이 바뀌면 안내 문구 타이머도 정리한다.
      if (dailyDrawRealtimeMessageTimerRef.current) {
        window.clearTimeout(dailyDrawRealtimeMessageTimerRef.current);
      }
    };
  }, [jarId, jar?.openMode, jar?.isOpen]);

  // 상세 정보를 받아온 뒤, OWNER / ADMIN 이면 초대 목록도 로드
  useEffect(() => {
    if (!jar) return;

    const canManage = jar.myRole === "OWNER" || jar.myRole === "ADMIN";

    if (canManage) {
      loadInvites();
      return;
    }

    setInvites([]);
    setInvitesError("");
    setInvitesLoading(false);
  }, [jarId, jar?.myRole]);

    // 페이지를 다시 열어도, 내가 숨긴 폐기 코드는 그대로 안 보이게 저장값을 꺼내와.
    useEffect(() => {
      try {
        const saved = localStorage.getItem(hiddenInviteStorageKey);
        const parsed = saved ? JSON.parse(saved) : [];

        // 혹시 문자열로 저장돼 있어도 숫자로 통일해줘.
        const normalized = Array.isArray(parsed)
          ? parsed.map((id) => Number(id)).filter((id) => !Number.isNaN(id))
          : [];

        setHiddenInviteIds(normalized);
      } catch {
        setHiddenInviteIds([]);
      } finally {
        // 이제 숨김 목록을 다 읽었으니 준비 완료
        setHiddenInvitesReady(true);
      }
    }, [hiddenInviteStorageKey]);

    // 숨긴 코드 목록이 바뀔 때마다 브라우저에 저장해 둬.
    useEffect(() => {
      // 아직 localStorage에서 기존 숨김 목록을 읽기 전이면 저장하지 않아.
      if (!hiddenInvitesReady) return;

      try {
        localStorage.setItem(
          hiddenInviteStorageKey,
          JSON.stringify(hiddenInviteIds)
        );
      } catch {
        // 저장 실패는 앱이 멈출 일은 아니라서 조용히 넘어가도 괜찮아.
      }
    }, [hiddenInviteStorageKey, hiddenInviteIds, hiddenInvitesReady]);

    useEffect(() => {
      if (!jar) return;

      setEditForm({
        name: jar.name ?? "",
        description: jar.description ?? "",
        theme: jar.theme ?? "LAVENDER",
        maxMembers: String(jar.maxMembers ?? 2),
        openMode: jar.openMode ?? "ALL_AT_ONCE",
        lockLevel: jar.lockLevel ?? "HIDDEN",
        openAt: formatDateTimeLocalValue(jar.openAt),
      });
    }, [jar]);

    useEffect(() => {
      if (!jar) return;
    }, [jar]);

  // 삭제 버튼 클릭
  async function handleDelete() {
    const ok = window.confirm(
      "이 저금통을 삭제하면 되돌리기 어려울 수 있어요.\n정말 삭제할까요?"
    );

    if (!ok) return;

    setDeleteLoading(true);

    try {
      // DELETE 같은 요청은 CSRF 토큰을 먼저 받아두는 흐름을 맞춰주는 게 안전해요.
      await fetchCsrf();
      await apiClient.delete(`/api/v1/jars/${jarId}`);

      window.alert("저금통이 삭제되었어요.");
      navigate("/jars", { replace: true });
    } catch (e) {
      const serverMessage =
        e?.response?.data?.error?.message ||
        e?.response?.data?.message ||
        e?.message ||
        "저금통 삭제에 실패했어요.";

      window.alert(serverMessage);
    } finally {
      setDeleteLoading(false);
    }
  }

  async function handleLeaveJar() {
    if (!canLeaveJar) {
      window.alert("방장은 저금통을 바로 나갈 수 없어요.");
      return;
    }

    const ok = window.confirm(
      "정말 이 저금통에서 나갈까요?\n나가면 다시 초대를 받아야 들어올 수 있어요."
    );

    if (!ok) return;

    setLeaveLoading(true);

    try {
      await fetchCsrf();

      await apiClient.post(`/api/v1/jars/${jarId}/leave`);

      window.alert("저금통에서 나갔어요.");
      navigate("/jars", { replace: true });
    } catch (e) {
      const serverMessage =
        e?.response?.data?.error?.message ||
        e?.response?.data?.message ||
        e?.message ||
        "저금통 나가기에 실패했어요.";

      window.alert(serverMessage);
    } finally {
      setLeaveLoading(false);
    }
  }

async function handleUpdateJar(e) {
  e.preventDefault();

  if (!canEditJar) {
    window.alert("저금통 수정은 방장 또는 관리자만 할 수 있어요.");
    return;
  }

  const trimmedName = editForm.name.trim();
  const trimmedDescription = editForm.description.trim();
  const maxMembers = Number(editForm.maxMembers);

  if (!trimmedName) {
    window.alert("저금통 이름을 입력해 주세요.");
    return;
  }

  if (!Number.isFinite(maxMembers) || maxMembers < 2 || maxMembers > 50) {
    window.alert("최대 인원은 2명 이상 50명 이하로 입력해 주세요.");
    return;
  }

  if (!editForm.openAt) {
    window.alert("오픈일을 입력해 주세요.");
    return;
  }

  setEditLoading(true);

  try {
    await fetchCsrf();

    await apiClient.patch(`/api/v1/jars/${jarId}`, {
      name: trimmedName,
      description: trimmedDescription,
      theme: editForm.theme,
      maxMembers,
      openAt: editForm.openAt,
      openMode: editForm.openMode,
      lockLevel: editForm.lockLevel,
    });

    await loadJarDetail();
    await loadMembers();

    setEditOpen(false);
    window.alert("저금통 설정을 수정했어요.");
  } catch (e) {
    const serverMessage =
      e?.response?.data?.error?.message ||
      e?.response?.data?.message ||
      e?.message ||
      "저금통 수정에 실패했어요.";

    window.alert(serverMessage);
  } finally {
    setEditLoading(false);
  }
}

// 숫자 1 올려서 NoteSection에게 열어! 보냄
function handleOpenNoteComposer() {
  setNoteCreateRequestId((prev) => prev + 1);
}

// 쪽지가 날아가서 들어갈 "저금통 입구" 좌표를 계산해 주는 함수
function getJarDropTargetRect() {
  const jarElement = jarVisualRef.current;

  if (!jarElement) return null;

  const rect = jarElement.getBoundingClientRect();

  return {
    // 저금통 가로 가운데
    x: rect.left + rect.width / 2,

    // 뚜껑 바로 아래쯤을 목표 지점으로 잡아줘
    y: rect.top + 86,
  };
}

// 확대 모달에서 보여줄 쪽지 목록 불러오기
async function loadJarZoomNotes() {
  setJarZoomLoading(true);
  setJarZoomError("");

  try {
    const res = await apiClient.get(`/api/v1/jars/${jarId}/notes`, {
      params: {
        page: 0,
        size: 24,
      },
    });

    const items = normalizeJarZoomNotes(res.data?.data);
    setJarZoomNotes(items);
  } catch (e) {
    const serverMessage =
      e?.response?.data?.error?.message ||
      e?.response?.data?.message ||
      e?.message ||
      "저금통 안의 쪽지를 불러오지 못했어요.";

    setJarZoomError(serverMessage);
    setJarZoomNotes([]);
  } finally {
    setJarZoomLoading(false);
  }
}

async function loadJarZoomComments(noteId) {
  if (!noteId) return [];

  setJarZoomCommentsLoading(true);
  setJarZoomCommentsError("");

  try {
    const res = await apiClient.get(
      `/api/v1/jars/${jarId}/notes/${noteId}/comments`
    );

    const items = normalizeCommentItems(res.data?.data);
    setJarZoomComments(items);

    // WebSocket 이벤트 처리 쪽에서 댓글 개수 계산할 수 있게 반환
    return items;
  } catch (e) {
    const serverMessage =
      e?.response?.data?.error?.message ||
      e?.response?.data?.message ||
      e?.message ||
      "댓글을 불러오지 못했어요.";

    setJarZoomCommentsError(serverMessage);
    setJarZoomComments([]);

    return [];
  } finally {
    setJarZoomCommentsLoading(false);
  }
}


async function handleOpenJarZoomNoteDetail(noteId, options = {}) {
    if (!noteId) return;

      const focusCommentId = options?.focusCommentId ?? null;

      // 이번에 특정 댓글로 들어온 경우 나중에 스크롤할 수 있게 저장
      setPendingFocusCommentId(focusCommentId ? Number(focusCommentId) : null);

      // 예전 강조 흔적은 먼저 지워줘
      setFocusedCommentId(null);

  setJarZoomDetailOpen(true);
  setJarZoomDetailNoteId(noteId);
  setJarZoomDetailLoading(true);
  setJarZoomDetailError("");
  setJarZoomDetailNote(null);

  // 댓글 관련 상태도 초기화
  setJarZoomComments([]);
  setJarZoomCommentsError("");
  setCommentDraft("");
  setEditingCommentId(null);
  setEditingContent("");

  setReplyTargetCommentId(null);
  setReplyDraftMap({});
  setReplyExpandedMap({});

  try {
    const [noteRes, commentRes] = await Promise.all([
      apiClient.get(`/api/v1/jars/${jarId}/notes/${noteId}`),
      apiClient.get(`/api/v1/jars/${jarId}/notes/${noteId}/comments`),
    ]);

    setJarZoomDetailNote(noteRes.data?.data || null);
    setJarZoomComments(normalizeCommentItems(commentRes.data?.data));
  } catch (e) {
    const serverMessage =
      e?.response?.data?.error?.message ||
      e?.response?.data?.message ||
      e?.message ||
      "쪽지 상세를 불러오지 못했어요.";

    setJarZoomDetailError(serverMessage);
  } finally {
    setJarZoomDetailLoading(false);
    setJarZoomCommentsLoading(false);
  }
}

function handleCloseJarZoomNoteDetail() {
  setJarZoomDetailOpen(false);
  setJarZoomDetailNoteId(null);
  setJarZoomDetailNote(null);
  setJarZoomDetailError("");
  setJarZoomDetailLoading(false);

  setReplyTargetCommentId(null);
  setReplyDraftMap({});
  setReplyExpandedMap({});
  setPendingFocusCommentId(null);
  setFocusedCommentId(null);
}

async function handleReactInJarZoomDetail(noteId, emoji) {
  if (!jar?.jarId || !noteId) return;

  if (!jar?.isOpen) {
    window.alert("저금통이 열린 뒤에 리액션을 남길 수 있어요.");
    return;
  }

  setJarZoomReactingNoteId(noteId);

  try {
    await fetchCsrf();

    const res = await apiClient.post(
      `/api/v1/jars/${jarId}/notes/${noteId}/reactions`,
      { emoji }
    );

    const summary = res.data?.data;

    patchJarZoomDetailNote(noteId, summary);
    patchJarZoomNoteInList(noteId, summary);
  } catch (e) {
    const serverMessage =
      e?.response?.data?.error?.message ||
      e?.response?.data?.message ||
      e?.message ||
      "리액션 처리에 실패했어요.";

    window.alert(serverMessage);
  } finally {
    setJarZoomReactingNoteId(null);
  }
}



function patchJarZoomNoteInList(noteId, summary) {
  setJarZoomNotes((prev) =>
    (prev || []).map((item) =>
      (item?.noteId ?? item?.id) === noteId
        ? {
            ...item,
            myReaction: summary?.myReaction ?? null,
            reactionCounts: Array.isArray(summary?.counts)
              ? summary.counts
              : Array.isArray(summary?.reactionCounts)
              ? summary.reactionCounts
              : [],
          }
        : item
    )
  );
}

function patchJarZoomDetailNote(noteId, summary) {
  setJarZoomDetailNote((prev) => {
    if (!prev) return prev;
    if ((prev?.noteId ?? prev?.id) !== noteId) return prev;

    return {
      ...prev,
      myReaction: summary?.myReaction ?? null,
      reactionCounts: Array.isArray(summary?.counts)
        ? summary.counts
        : Array.isArray(summary?.reactionCounts)
        ? summary.reactionCounts
        : [],
    };
  });
}

function patchCommentCountEverywhere(noteId, nextCount) {
  setJarZoomNotes((prev) =>
    (prev || []).map((item) =>
      (item?.noteId ?? item?.id) === noteId
        ? {
            ...item,
            commentCount: nextCount,
          }
        : item
    )
  );

  setJarZoomDetailNote((prev) => {
    if (!prev) return prev;
    if ((prev?.noteId ?? prev?.id) !== noteId) return prev;

    return {
      ...prev,
      commentCount: nextCount,
    };
  });
}

/*
 * 어떤 댓글 아래에 답글 입력창을 열지 정하는 함수야.
 *
 * UX 규칙
 * - 같은 댓글을 다시 누르면 닫기
 * - 다른 댓글로 이동할 때
 *   입력 중인 답글이 비어 있으면 바로 이동
 *   입력 중인 답글이 있으면 한 번 물어보고 이동
 */
function handleToggleReply(commentId) {
  // 지금 열려 있는 답글창이 없으면 그냥 열기
  if (!replyTargetCommentId) {
    setReplyTargetCommentId(commentId);
    return;
  }

  // 같은 댓글을 다시 누르면 닫기
  if (replyTargetCommentId === commentId) {
    const currentDraft = normalizeCommentContent(
      replyDraftMap[replyTargetCommentId]
    );

    if (currentDraft) {
      const ok = window.confirm("작성 중인 답글이 있어요. 닫을까요?");
      if (!ok) return;
    }

    setReplyTargetCommentId(null);
    return;
  }

  // 다른 댓글로 이동하려는 경우
  const currentDraft = normalizeCommentContent(
    replyDraftMap[replyTargetCommentId]
  );

  // 작성 중인 내용이 있으면 확인
  if (currentDraft) {
    const ok = window.confirm(
      "작성 중인 답글이 있어요.\n다른 댓글로 이동하면 지금 내용은 그대로 두고 입력창만 바뀌어요. 이동할까요?"
    );

    if (!ok) return;
  }

  setReplyTargetCommentId(commentId);
}

/*
 * 특정 댓글의 답글 목록을 펼치거나 숨기는 함수야.
 *
 * - true면 답글 목록 보여주기
 * - false면 답글 목록 숨기기
 */
function handleToggleReplies(commentId) {
  setReplyExpandedMap((prev) => ({
    ...prev,
    [commentId]: !prev[commentId],
  }));
}

/*
 * 특정 댓글 아래 답글 입력값을 저장하는 함수야.
 */
function handleReplyDraftChange(commentId, value) {
  setReplyDraftMap((prev) => ({
    ...prev,
    [commentId]: value,
  }));
}

/*
 * 이 함수는 특정 댓글 아래에 대댓글을 등록하는 역할을 해.
 */
async function handleCreateReply(parentCommentId) {
  const noteId = jarZoomDetailNoteId;
  const content = normalizeCommentContent(replyDraftMap[parentCommentId]);

  if (!noteId || !parentCommentId) return;

  if (!content) {
    window.alert("답글 내용을 입력해 주세요.");
    return;
  }

  setCommentSubmitting(true);

  try {
    await fetchCsrf();

    await apiClient.post(
      `/api/v1/jars/${jarId}/notes/${noteId}/comments`,
      {
        content,
        parentCommentId,
      }
    );

    // 댓글 전체 다시 불러오기
    await loadJarZoomComments(noteId);

    // 입력창 값 비우기
    setReplyDraftMap((prev) => ({
      ...prev,
      [parentCommentId]: "",
    }));

    // 답글 입력창 닫기
    setReplyTargetCommentId(null);

    // 방금 답글 단 댓글의 답글 목록 펼치기
    setReplyExpandedMap((prev) => ({
      ...prev,
      [parentCommentId]: true,
    }));

    // 총 댓글 수 다시 계산
    const refreshedCommentsRes = await apiClient.get(
      `/api/v1/jars/${jarId}/notes/${noteId}/comments`
    );
    const refreshedItems = normalizeCommentItems(refreshedCommentsRes.data?.data);

    setJarZoomComments(refreshedItems);
    patchCommentCountEverywhere(noteId, getTotalCommentCount(refreshedItems));
  } catch (e) {
    const serverMessage =
      e?.response?.data?.error?.message ||
      e?.response?.data?.message ||
      e?.message ||
      "답글 등록에 실패했어요.";

    window.alert(serverMessage);
  } finally {
    setCommentSubmitting(false);
  }
}

async function handleCreateComment() {
  const noteId = jarZoomDetailNoteId;
  const content = normalizeCommentContent(commentDraft);

  if (!noteId) return;

  if (!content) {
    window.alert("댓글 내용을 입력해 주세요.");
    return;
  }

  setCommentSubmitting(true);

  try {
    await fetchCsrf();

    await apiClient.post(
      `/api/v1/jars/${jarId}/notes/${noteId}/comments`,
      { content }
    );

    const commentRes = await apiClient.get(
      `/api/v1/jars/${jarId}/notes/${noteId}/comments`
    );
    const items = normalizeCommentItems(commentRes.data?.data);

    setJarZoomComments(items);
    setCommentDraft("");
    patchCommentCountEverywhere(noteId, getTotalCommentCount(items));
  } catch (e) {
    const serverMessage =
      e?.response?.data?.error?.message ||
      e?.response?.data?.message ||
      e?.message ||
      "댓글 등록에 실패했어요.";

    window.alert(serverMessage);
  } finally {
    setCommentSubmitting(false);
  }
}

async function handleUpdateComment(commentId) {
  const noteId = jarZoomDetailNoteId;
  const content = normalizeCommentContent(editingContent);

  if (!noteId || !commentId) return;

  if (!content) {
    window.alert("댓글 내용을 입력해 주세요.");
    return;
  }

  setCommentSubmitting(true);

  try {
    await fetchCsrf();

    await apiClient.patch(
      `/api/v1/jars/${jarId}/notes/${noteId}/comments/${commentId}`,
      { content }
    );

    const commentRes = await apiClient.get(
      `/api/v1/jars/${jarId}/notes/${noteId}/comments`
    );
    const items = normalizeCommentItems(commentRes.data?.data);

    setJarZoomComments(items);
    setEditingCommentId(null);
    setEditingContent("");
    patchCommentCountEverywhere(noteId, getTotalCommentCount(items));
  } catch (e) {
    const serverMessage =
      e?.response?.data?.error?.message ||
      e?.response?.data?.message ||
      e?.message ||
      "댓글 수정에 실패했어요.";

    window.alert(serverMessage);
  } finally {
    setCommentSubmitting(false);
  }
}

async function handleDeleteComment(commentId) {
  const noteId = jarZoomDetailNoteId;

  if (!noteId || !commentId) return;

  const ok = window.confirm("이 댓글을 삭제할까요?");
  if (!ok) return;

  setDeletingCommentId(commentId);

  try {
    await fetchCsrf();

    await apiClient.delete(
      `/api/v1/jars/${jarId}/notes/${noteId}/comments/${commentId}`
    );

    const commentRes = await apiClient.get(
      `/api/v1/jars/${jarId}/notes/${noteId}/comments`
    );
    const items = normalizeCommentItems(commentRes.data?.data);

    setJarZoomComments(items);
    patchCommentCountEverywhere(noteId, getTotalCommentCount(items));

    if (editingCommentId === commentId) {
      setEditingCommentId(null);
      setEditingContent("");
    }
  } catch (e) {
    const serverMessage =
      e?.response?.data?.error?.message ||
      e?.response?.data?.message ||
      e?.message ||
      "댓글 삭제에 실패했어요.";

    window.alert(serverMessage);
  } finally {
    setDeletingCommentId(null);
  }
}


function handleStartEditComment(comment) {
  setEditingCommentId(comment.commentId);
  setEditingContent(comment.content || "");
}

function handleCancelEditComment() {
  setEditingCommentId(null);
  setEditingContent("");
}

// 저금통 클릭 시 확대 모달 열기
async function handleOpenJarZoom() {
  setJarZoomOpen(true);
  await loadJarZoomNotes();
}

// 저금통 확대 모달 닫기
function handleCloseJarZoom() {
  setJarZoomOpen(false);
}

/*
 * 채팅 버튼 옆에 보여줄 안 읽은 메시지 개수를 불러오는 함수야.
 *
 * 쉽게 말하면:
 * - 서버에 "내가 안 본 채팅 몇 개야?"라고 물어봄
 * - 그 숫자를 버튼 빨간 뱃지에 보여줌
 */
async function loadChatUnreadCount() {
  if (!jarId) return;

  try {
    const data = await getChatUnreadCount(jarId);
    setChatUnreadCount(Number(data?.unreadCount || 0));
  } catch {
    // unread count는 보조 기능이라 실패해도 화면을 깨지 않게 0으로 둠
    setChatUnreadCount(0);
  }
}

/*
 * Daily Draw 오늘 카드 조회
 *
 * 역할:
 * - 서버에 "오늘 뽑힌 카드가 있어?"라고 물어본다.
 * - 있으면 dailyDrawToday에 저장한다.
 * - 없으면 hasTodayDraw=false 상태가 저장된다.
 */
async function loadDailyDrawToday({ silent = false } = {}) {
  if (!jarId) return;

  if (!silent) {
    setDailyDrawLoading(true);
  }

  setDailyDrawError("");

  try {
    const data = await getDailyDrawToday(jarId);
    setDailyDrawToday(data || null);
  } catch (e) {
    const serverMessage =
      e?.response?.data?.error?.message ||
      e?.response?.data?.message ||
      e?.message ||
      "오늘의 추억 한 장을 불러오지 못했어요.";

    setDailyDrawError(serverMessage);
    setDailyDrawToday(null);
  } finally {
    if (!silent) {
      setDailyDrawLoading(false);
    }
  }
}

/*
 * Daily Draw 히스토리 조회
 *
 * 역할:
 * - 지금까지 어떤 날짜에 어떤 쪽지가 뽑혔는지 서버에서 가져온다.
 */
async function loadDailyDrawHistory({ silent = false } = {}) {
  if (!jarId) return;

  if (!silent) {
    setDailyDrawLoading(true);
  }

  setDailyDrawError("");

  try {
    const data = await getDailyDrawHistory(jarId, 0, 20);
    const items = Array.isArray(data?.items) ? data.items : [];

    setDailyDrawHistory(items);
  } catch (e) {
    const serverMessage =
      e?.response?.data?.error?.message ||
      e?.response?.data?.message ||
      e?.message ||
      "Daily Draw 기록을 불러오지 못했어요.";

    setDailyDrawError(serverMessage);
    setDailyDrawHistory([]);
  } finally {
    if (!silent) {
      setDailyDrawLoading(false);
    }
  }
}

/*
 * Daily Draw 전체 새로고침
 *
 * 역할:
 * - 오늘 카드와 히스토리를 한 번에 다시 맞춘다.
 */
async function refreshDailyDraw() {
  setDailyDrawLoading(true);
  setDailyDrawError("");

  try {
    await Promise.all([
      loadDailyDrawToday({ silent: true }),
      loadDailyDrawHistory({ silent: true }),
    ]);
  } finally {
    setDailyDrawLoading(false);
  }
}

/*
 * 오늘의 추억 한 장 뽑기
 *
 * 역할:
 * - 사용자가 "오늘의 추억 한 장 뽑기" 버튼을 누르면 실행된다.
 * - 서버가 아직 안 뽑힌 쪽지 중 랜덤 1장을 골라 저장한다.
 * - 이미 오늘 카드가 있으면 기존 카드를 그대로 돌려준다.
 */
async function handleDrawDailyDrawToday() {
  if (!jarId) return;

  if (jar?.openMode !== "DAILY_DRAW") {
    window.alert("하루 1장 랜덤 공개 방식 저금통에서만 사용할 수 있어요.");
    return;
  }

  if (!jar?.isOpen) {
    window.alert("저금통이 열린 뒤에 오늘의 추억 한 장을 뽑을 수 있어요.");
    return;
  }

  setDailyDrawDrawing(true);
  setDailyDrawError("");

  try {
    const data = await drawDailyDrawToday(jarId);

    /*
     * POST 응답은 DailyDrawResponse 하나다.
     * 그런데 화면 상태는 GET /today 응답처럼
     * { hasTodayDraw, dailyDraw, message } 모양으로 들고 있으면 편하다.
     */
    setDailyDrawToday({
      hasTodayDraw: true,
      dailyDraw: data,
      message: data?.newlyDrawn
        ? "오늘의 추억 한 장이 공개되었어요."
        : "이미 공개된 오늘의 추억 한 장을 보여드려요.",
    });

    // 히스토리도 같이 최신화한다.
    await loadDailyDrawHistory({ silent: true });

    // 저금통 확대 모달의 쪽지 목록도 최신화한다.
    await loadJarZoomNotes();
  } catch (e) {
    const serverMessage =
      e?.response?.data?.error?.message ||
      e?.response?.data?.message ||
      e?.message ||
      "오늘의 추억 한 장 뽑기에 실패했어요.";

    setDailyDrawError(serverMessage);
  } finally {
    setDailyDrawDrawing(false);
  }
}

/*
 * Daily Draw 카드에서 쪽지 상세 열기
 *
 * 역할:
 * - 오늘 카드나 히스토리에서 쪽지를 누르면
 * - 기존에 만들어둔 JarZoomNoteDetailModal을 재사용해서 상세를 보여준다.
 */
async function handleOpenDailyDrawNoteDetail(noteId) {
  if (!noteId) return;

  // 오른쪽 확대 목록도 자연스럽게 채워두기 위해 확대 모달을 같이 열어둔다.
  setJarZoomOpen(true);

  await loadJarZoomNotes();
  await handleOpenJarZoomNoteDetail(noteId);
}

/*
 * 채팅 모달 열기
 *
 * 사용자가 채팅방을 열었다는 건
 * 이제 메시지를 보러 들어간다는 뜻이므로
 * 버튼의 unread badge는 우선 0으로 숨겨준다.
 *
 * 실제 서버 읽음 처리는 JarChatPanel 안에서 마지막 메시지 기준으로 처리된다.
 */
function handleOpenJarChat() {
  setJarChatOpen(true);
  setChatUnreadCount(0);
}

/*
 * 채팅 모달 닫기
 *
 * 모달을 닫은 뒤 서버 기준 unread count를 다시 한 번 맞춰준다.
 */
async function handleCloseJarChat() {
  setJarChatOpen(false);
  await loadChatUnreadCount();
}

/*
 * 저금통 오픈 축하 모달 닫기
 * 사용자가 X 버튼을 누르거나 "조금 있다 보기"를 누르면 실행된다.
 */
function handleCloseJarOpenCelebration() {
  setJarOpenCelebrationOpen(false);

  if (jarOpenCelebrationTimerRef.current) {
    window.clearTimeout(jarOpenCelebrationTimerRef.current);
  }
}

/*
 * 저금통 오픈 축하 모달에서 "추억 보러가기"를 눌렀을 때 실행된다.
 *
 * 역할:
 * - 축하 모달을 닫고
 * - 기존에 만들어둔 저금통 확대 모달을 연다.
 */
async function handleViewOpenedJarNotes() {
  handleCloseJarOpenCelebration();
  await handleOpenJarZoom();
}

async function handleChangeMemberRole(targetUserId, nextRole) {
  if (!canChangeMemberRole) {
    window.alert("멤버 역할 변경은 방장만 할 수 있어요.");
    return;
  }

  const ok = window.confirm(
    `이 멤버의 역할을 ${ROLE_LABEL[nextRole] || nextRole}(으)로 바꿀까요?`
  );

  if (!ok) return;

  setRoleUpdateLoadingId(targetUserId);

  try {
    await fetchCsrf();

    await apiClient.patch(`/api/v1/jars/${jarId}/members/${targetUserId}/role`, {
      role: nextRole,
    });

    await loadMembers();
    await loadJarDetail();

    window.alert("멤버 역할을 변경했어요.");
  } catch (e) {
    const serverMessage =
      e?.response?.data?.error?.message ||
      e?.response?.data?.message ||
      e?.message ||
      "멤버 역할 변경에 실패했어요.";

    window.alert(serverMessage);
  } finally {
    setRoleUpdateLoadingId(null);
  }
}

async function handleKickMember(targetUserId, targetName, targetRole) {
  if (!canKickMembers) {
    window.alert("멤버 강퇴는 방장 또는 관리자만 할 수 있어요.");
    return;
  }

  if (targetRole === "OWNER") {
    window.alert("방장은 강퇴할 수 없어요.");
    return;
  }

  const ok = window.confirm(
    `${targetName || "이 멤버"}님을 저금통에서 내보낼까요?`
  );

  if (!ok) return;

  setKickLoadingId(targetUserId);

  try {
    await fetchCsrf();

    await apiClient.post(`/api/v1/jars/${jarId}/members/${targetUserId}/kick`);

    await loadMembers();
    await loadJarDetail();

    window.alert("멤버를 강퇴했어요.");
  } catch (e) {
    const serverMessage =
      e?.response?.data?.error?.message ||
      e?.response?.data?.message ||
      e?.message ||
      "멤버 강퇴에 실패했어요.";

    window.alert(serverMessage);
  } finally {
    setKickLoadingId(null);
  }
}

async function handleCreateInvite(e) {
  e.preventDefault();

  const expiresInHours = Math.min(
    168,
    Math.max(1, Number(inviteForm.expiresInHours || 24))
  );

  const maxUses = Math.min(
    50,
    Math.max(1, Number(inviteForm.maxUses || 1))
  );

  setCreateInviteLoading(true);

  try {
    await fetchCsrf();

    const res = await apiClient.post(`/api/v1/jars/${jarId}/invites`, {
      expiresInHours,
      maxUses,
    });

    const created = res.data?.data;

    await loadInvites();

    // 새 코드를 만들면 첫 페이지로 보내서 바로 보이게 해줘.
    setInvitePage(1);

    const createdInviteUrl = created?.code ? getInviteUrl(created.code) : "";

    window.alert(
      created?.code
        ? `초대코드가 만들어졌어요.\n코드: ${created.code}\n링크: ${createdInviteUrl}`
        : "초대코드가 만들어졌어요."
    );
  } catch (e) {
    const serverMessage =
      e?.response?.data?.error?.message ||
      e?.response?.data?.message ||
      e?.message ||
      "초대코드 생성에 실패했어요.";

    window.alert(serverMessage);
  } finally {
    setCreateInviteLoading(false);
  }
}

// 초대코드로 실제 공유용 링크를 만드는 함수
function getInviteUrl(code) {
  if (!code) return "";

  // 지금 접속한 주소를 기준으로 자동으로 맞춰줘.
  // 로컬이면 localhost:3000, 배포면 www.esjh.shop 이 돼.
  return `${window.location.origin}/invite/${code}`;
}

// 초대 링크를 복사하는 함수
async function handleCopyInviteUrl(code) {
  try {
    const inviteUrl = getInviteUrl(code);

    await navigator.clipboard.writeText(inviteUrl);
    window.alert("초대 링크를 복사했어요.");
  } catch (e) {
    window.alert("링크 복사에 실패했어요. 다시 한 번 시도해 주세요.");
  }
}

async function handleCopyInviteCode(code) {
  try {
    await navigator.clipboard.writeText(code);
    window.alert("초대코드를 복사했어요.");
  } catch (e) {
    window.alert("복사에 실패했어요. 다시 한 번 시도해 주세요.");
  }
}

async function handleRevokeInvite(inviteId) {
  const ok = window.confirm("이 초대코드를 폐기할까요?");

  if (!ok) return;

  setRevokeLoadingId(inviteId);

  try {
    await fetchCsrf();
    await apiClient.post(`/api/v1/jars/${jarId}/invites/${inviteId}/revoke`);

    await loadInvites();
    window.alert("초대코드를 폐기했어요.");
  } catch (e) {
    const serverMessage =
      e?.response?.data?.error?.message ||
      e?.response?.data?.message ||
      e?.message ||
      "초대코드 폐기에 실패했어요.";

    window.alert(serverMessage);
  } finally {
    setRevokeLoadingId(null);
  }
}

// 폐기된 코드만 X 버튼으로 화면에서 숨길 수 있어.
function handleHideRevokedInvite(inviteId) {
  const targetInvite = invites.find((invite) => invite.inviteId === inviteId);

  if (!targetInvite?.revokedAt) {
    window.alert("폐기된 초대코드만 화면에서 숨길 수 있어요.");
    return;
  }

    setHiddenInviteIds((prev) => {
      const normalizedId = Number(inviteId);

      if (prev.includes(normalizedId)) return prev;
      return [...prev, normalizedId];
    });
}

// 숨겼던 폐기 코드들을 다시 보고 싶을 때 사용해.
function handleRestoreHiddenInvites() {
  setHiddenInviteIds([]);
}

  const openStatus = useMemo(() => getOpenStatus(jar), [jar]);
  const palette = useMemo(() => getThemePalette(jar?.theme), [jar]);

  // 인원 진행률 계산
  const memberPercent = useMemo(() => {
    if (!jar?.maxMembers) return 0;
    return Math.min(100, Math.round((jar.memberCount / jar.maxMembers) * 100));
  }, [jar]);

  // 삭제 버튼은 OWNER일 때만 보여주기
  const canDelete = jar?.myRole === "OWNER";

  // 수정 가능한 사람 체크
  const canEditJar = jar?.myRole === "OWNER" || jar?.myRole === "ADMIN";

  // 방장이 아니고, 현재 어떤 역할이든 있으면 나가기 가능
  const canLeaveJar = !!jar?.myRole && jar.myRole !== "OWNER";

  // 역할 변경은 현재 백엔드 규칙상 OWNER만 가능
  const canChangeMemberRole = jar?.myRole === "OWNER";

  // 강퇴는 OWNER 또는 ADMIN 이 할 수 있어.
  const canKickMembers = jar?.myRole === "OWNER" || jar?.myRole === "ADMIN";

    const canManageInvites =
      jar?.myRole === "OWNER" || jar?.myRole === "ADMIN";

    const sortedMembers = useMemo(() => {
      const roleOrder = {
        OWNER: 0,
        ADMIN: 1,
        MEMBER: 2,
      };

      return [...members].sort((a, b) => {
        const aOrder = roleOrder[a.role] ?? 99;
        const bOrder = roleOrder[b.role] ?? 99;
        return aOrder - bOrder;
      });
    }, [members]);

    const activeInviteCount = useMemo(() => {
      return invites.filter((invite) => invite.isActive).length;
    }, [invites]);

    // X로 숨긴 초대코드는 목록에서 빼줄 거야.
    const visibleInvites = useMemo(() => {
      // 숨김 목록을 아직 읽기 전이면 일단 그대로 계산하지 않도록 막아줘.
      if (!hiddenInvitesReady) return [];

      return invites.filter(
        (invite) => !hiddenInviteIds.includes(Number(invite.inviteId))
      );
    }, [invites, hiddenInviteIds, hiddenInvitesReady]);

    // 새로 만든 초대코드가 먼저 보이도록 최신순 정렬
    const orderedInvites = useMemo(() => {
      return [...visibleInvites].sort((a, b) => {
        const aTime = new Date(a.createdAt || 0).getTime();
        const bTime = new Date(b.createdAt || 0).getTime();
        return bTime - aTime;
      });
    }, [visibleInvites]);

    // 총 페이지 수 계산
    const invitePageCount = useMemo(() => {
      return Math.max(1, Math.ceil(orderedInvites.length / INVITES_PER_PAGE));
    }, [orderedInvites]);

    // 현재 페이지에 보여줄 2개만 잘라서 꺼내기
    const pagedInvites = useMemo(() => {
      const startIndex = (invitePage - 1) * INVITES_PER_PAGE;
      return orderedInvites.slice(
        startIndex,
        startIndex + INVITES_PER_PAGE
      );
    }, [orderedInvites, invitePage]);

    // 숨긴 폐기 코드가 몇 개인지 세기
    const hiddenRevokedCount = useMemo(() => {
      return invites.filter((invite) =>
        hiddenInviteIds.includes(invite.inviteId)
      ).length;
    }, [invites, hiddenInviteIds]);

    // 현재 페이지가 범위를 벗어나면 마지막 페이지로 자동 보정
    useEffect(() => {
      if (invitePage > invitePageCount) {
        setInvitePage(invitePageCount);
      }
    }, [invitePage, invitePageCount]);
  // 로딩 화면
  if (loading) {
    return (
      <div className="min-h-[calc(100vh-80px)] bg-gradient-to-b from-rose-50 via-white to-orange-50 px-6 py-10">
        <div className="mx-auto max-w-6xl">
          <div className="animate-pulse rounded-[32px] border border-white bg-white/80 p-8 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
            <div className="mb-6 h-5 w-28 rounded-full bg-slate-200" />
            <div className="mb-4 h-10 w-72 rounded-2xl bg-slate-200" />
            <div className="mb-10 h-5 w-96 rounded-full bg-slate-100" />

            <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="h-[360px] rounded-[28px] bg-slate-100" />
              <div className="space-y-4">
                <div className="h-24 rounded-[24px] bg-slate-100" />
                <div className="h-24 rounded-[24px] bg-slate-100" />
                <div className="h-24 rounded-[24px] bg-slate-100" />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 에러 화면
  if (error || !jar) {
    return (
      <div className="min-h-[calc(100vh-80px)] bg-gradient-to-b from-rose-50 via-white to-orange-50 px-6 py-10">
        <div className="mx-auto max-w-3xl rounded-[32px] border border-rose-100 bg-white p-8 text-center shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
          <div className="mb-4 text-5xl">🥲</div>
          <h1 className="mb-3 text-2xl font-extrabold text-slate-800">
            저금통 정보를 불러오지 못했어요
          </h1>
          <p className="mb-8 text-sm leading-7 text-slate-500">
            {error || "요청한 저금통이 없거나 접근할 수 없어요."}
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/jars"
              className="rounded-2xl border border-slate-200 px-5 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
            >
              목록으로 돌아가기
            </Link>

            <button
              onClick={() => window.location.reload()}
              className="rounded-2xl bg-gradient-to-r from-rose-400 to-orange-400 px-5 py-3 text-sm font-bold text-white shadow-md transition hover:scale-[1.02]"
            >
              다시 시도하기
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-80px)] bg-gradient-to-b from-rose-50 via-white to-orange-50 px-6 py-10">
      <div className="mx-auto max-w-6xl">
        {/* 상단 이동 링크 */}
        <div className="mb-5 flex items-center justify-between gap-3">
          <Link
            to="/jars"
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-50"
          >
            ← 저금통 목록으로
          </Link>

          <div
            className={`rounded-full px-4 py-2 text-xs font-extrabold tracking-[0.2em] ${openStatus.chipClass}`}
          >
            {openStatus.label}
          </div>
        </div>

        {/* 메인 카드 */}
        <div
          className={`overflow-hidden rounded-[36px] border bg-gradient-to-br ${palette.hero} shadow-[0_24px_70px_rgba(15,23,42,0.10)]`}
        >
          <div className="grid gap-8 p-8 lg:grid-cols-[1.1fr_0.9fr] lg:p-10">
            {/* 왼쪽: 분위기 + 큰 저금통 */}
            <section>
              <div className="mb-4 flex flex-wrap gap-2">
                <span
                  className={`rounded-full px-3 py-1 text-xs font-bold shadow-sm ${palette.badge}`}
                >
                  {THEME_LABEL[jar.theme] || jar.theme}
                </span>

                <span className="rounded-full bg-white/80 px-3 py-1 text-xs font-bold text-slate-600 shadow-sm">
                  {ROLE_LABEL[jar.myRole] || jar.myRole}
                </span>

                <span className="rounded-full bg-white/80 px-3 py-1 text-xs font-bold text-slate-600 shadow-sm">
                  {OPEN_MODE_LABEL[jar.openMode] || jar.openMode}
                </span>
              </div>

              <h1 className="mb-3 text-3xl font-black leading-tight text-slate-800 md:text-4xl">
                {jar.name}
              </h1>

              <p className="mb-8 max-w-2xl text-sm leading-7 text-slate-600 md:text-base">
                {jar.description || "아직 설명이 없는 저금통이에요."}
              </p>

              <div className={`mb-6 rounded-[28px] border p-5 shadow-sm backdrop-blur-sm ${palette.panel}`}>
                <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
                  현재 상태
                </p>
                <p className="mb-1 text-lg font-extrabold text-slate-800">
                  {openStatus.description}
                </p>
                <p className="text-sm text-slate-500">
                  오픈 예정 날짜: {formatDate(jar.openAt)}
                </p>
              </div>

              <div className="relative mb-6">
                <JarVisual
                  jar={jar}
                  jarRef={jarVisualRef}
                  onClick={handleOpenJarZoom}
                  interactive
                />

                <div className="mt-4 flex flex-col items-center justify-center gap-3 lg:absolute lg:right-0 lg:top-1/2 lg:mt-0 lg:-translate-y-1/2">
                  {/* 새 쪽지 작성 버튼 */}
                  <button
                    type="button"
                    onClick={handleOpenNoteComposer}
                    className={`w-[152px] rounded-2xl px-5 py-3 text-sm font-bold shadow-[0_16px_36px_rgba(15,23,42,0.16)] transition hover:scale-[1.02] ${palette.primaryButton}`}
                  >
                    새 쪽지 쓰기
                  </button>

                  {/* 저금통 채팅 모달 열기 버튼 */}
                  <button
                    type="button"
                    onClick={handleOpenJarChat}
                    className={`relative w-[152px] rounded-2xl border px-5 py-3 text-sm font-bold shadow-sm transition hover:scale-[1.02] ${palette.outlineButton}`}
                  >
                    💬 저금통 채팅

                    {chatUnreadCount > 0 && (
                      <span className="absolute -right-2 -top-2 flex h-6 min-w-6 items-center justify-center rounded-full bg-red-500 px-2 text-[11px] font-black text-white shadow-md">
                        {chatUnreadCount > 99 ? "99+" : chatUnreadCount}
                      </span>
                    )}
                  </button>
                </div>
              </div>

              <div className={`mb-6 rounded-[28px] border p-5 shadow-sm backdrop-blur-sm ${palette.panel}`}>
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm font-extrabold text-slate-800">
                    참여 인원 현황
                  </p>
                  <p className="text-sm font-bold text-slate-500">
                    {jar.memberCount} / {jar.maxMembers}명
                  </p>
                </div>

                <div className="h-3 overflow-hidden rounded-full bg-slate-200">
                  <div
                    className={`h-full rounded-full ${palette.badge}`}
                    style={{ width: `${memberPercent}%` }}
                  />
                </div>

                <p className="mt-3 text-xs text-slate-500">
                  이 저금통은 최대 {jar.maxMembers}명까지 함께할 수 있어요.
                </p>
              </div>
            </section>

            {/* 오른쪽: 정보 카드들 */}
            <aside className="space-y-5">
              <div className={`rounded-[30px] border p-6 shadow-sm backdrop-blur-sm ${palette.panel}`}>
                <p className="mb-4 text-sm font-extrabold text-slate-800">
                  한눈에 보는 저금통 정보
                </p>

                <div className="grid gap-3 sm:grid-cols-2">
                  <InfoItem label="저금통 ID" value={jar.jarId} className={palette.infoBox} />
                  <InfoItem label="내 역할" value={ROLE_LABEL[jar.myRole] || jar.myRole} className={palette.infoBox} />
                  <InfoItem label="테마" value={THEME_LABEL[jar.theme] || jar.theme} className={palette.infoBox} />
                  <InfoItem label="잠금 레벨" value={LOCK_LEVEL_LABEL[jar.lockLevel] || jar.lockLevel} className={palette.infoBox} />
                  <InfoItem label="공개 방식" value={OPEN_MODE_LABEL[jar.openMode] || jar.openMode} className={palette.infoBox} />
                  <InfoItem label="상태" value={jar.isOpen ? "공개됨" : "잠겨 있음"} className={palette.infoBox} />
                </div>
              </div>

              <div className={`rounded-[30px] border p-6 shadow-sm backdrop-blur-sm ${palette.panel}`}>
                <p className="mb-4 text-sm font-extrabold text-slate-800">
                  시간 정보
                </p>

                <div className="space-y-3">
                  <InfoItem label="생성일" value={formatDate(jar.createdAt)} className={palette.infoBox} />
                  <InfoItem label="최근 수정일" value={formatDate(jar.updatedAt)} className={palette.infoBox} />
                  <InfoItem label="오픈일" value={formatDate(jar.openAt)} className={palette.infoBox} />
                </div>
              </div>

              <div className={`rounded-[30px] border p-6 shadow-sm backdrop-blur-sm ${palette.panel}`}>
                <p className="mb-4 text-sm font-extrabold text-slate-800">
                  빠른 동작
                </p>

                <div className="grid gap-3">
                  <Link
                    to="/jars"
                    className={`rounded-2xl border px-4 py-3 text-center text-sm font-bold transition ${palette.outlineBtn}`}
                  >
                    목록으로 돌아가기
                  </Link>
                    {canEditJar && (
                      <button
                        type="button"
                        onClick={() => setEditOpen(true)}
                        className={`rounded-2xl px-4 py-3 text-sm font-bold shadow-md transition hover:scale-[1.01] ${palette.primaryButton}`}
                      >
                        저금통 설정 수정하기
                      </button>
                    )}
                  {canLeaveJar && (
                    <button
                      type="button"
                      onClick={handleLeaveJar}
                      disabled={leaveLoading}
                      className={`rounded-2xl border px-4 py-3 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-60 ${palette.outlineBtn}`}
                    >
                      {leaveLoading ? "나가는 중..." : "저금통 나가기"}
                    </button>
                  )}
                  {canDelete && (
                    <button
                      onClick={handleDelete}
                      disabled={deleteLoading}
                      className={`rounded-2xl px-4 py-3 text-sm font-bold shadow-md transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60 ${palette.dangerBtn}`}
                    >
                      {deleteLoading ? "삭제하는 중..." : "저금통 삭제하기"}
                    </button>
                  )}

                  {!canDelete && (
                    <div className={`rounded-2xl border border-dashed px-4 py-3 text-sm ${palette.hintBox}`}>
                      삭제는 방장만 할 수 있어요.
                    </div>
                  )}
                </div>
              </div>
            </aside>
          </div>
        </div>

        <DailyDrawSection
          jar={jar}
          palette={palette}
          today={dailyDrawToday}
          history={dailyDrawHistory}
          loading={dailyDrawLoading}
          drawing={dailyDrawDrawing}
          error={dailyDrawError}
          onDraw={handleDrawDailyDrawToday}
          onReload={refreshDailyDraw}
          onOpenNoteDetail={handleOpenDailyDrawNoteDetail}
          realtimeMessage={dailyDrawRealtimeMessage}
        />

        <NoteSection
          key={`note-section-${jarId}-${noteSectionRefreshKey}`}
          jar={jar}
          palette={palette}
          formatDate={formatDate}
          showCreateButton={false}
          showSearchControls={false}
          createRequestId={noteCreateRequestId}
          getJarDropTargetRect={getJarDropTargetRect}
        />

        <JarZoomModal
          open={jarZoomOpen}
          jar={jar}
          notes={jarZoomNotes}
          loading={jarZoomLoading}
          error={jarZoomError}
          palette={palette}
          onClose={handleCloseJarZoom}
          onRetry={loadJarZoomNotes}
          onOpenNoteDetail={handleOpenJarZoomNoteDetail}
          onReactNote={handleReactInJarZoomDetail}
          reactingNoteId={jarZoomReactingNoteId}
        />
        <JarChatModal
          open={jarChatOpen}
          jar={jar}
          palette={palette}
          currentUserId={me?.userId}
          onClose={handleCloseJarChat}
        />
        <JarOpenCelebrationModal
          open={jarOpenCelebrationOpen}
          jar={jar}
          palette={palette}
          event={jarOpenCelebrationEvent}
          onClose={handleCloseJarOpenCelebration}
          onViewNotes={handleViewOpenedJarNotes}
        />
        <JarZoomNoteDetailModal
          open={jarZoomDetailOpen}
          note={jarZoomDetailNote}
          loading={jarZoomDetailLoading}
          error={jarZoomDetailError}
          jar={jar}
          palette={palette}
          onClose={handleCloseJarZoomNoteDetail}
          onRetry={() => handleOpenJarZoomNoteDetail(jarZoomDetailNoteId)}
          reacting={jarZoomReactingNoteId === jarZoomDetailNoteId}
          onReact={(emoji) => handleReactInJarZoomDetail(jarZoomDetailNoteId, emoji)}

          comments={jarZoomComments}
          commentsLoading={jarZoomCommentsLoading}
          commentsError={jarZoomCommentsError}
          currentUserId={me?.userId}
          commentDraft={commentDraft}
          onCommentDraftChange={setCommentDraft}
          onCreateComment={handleCreateComment}
          commentSubmitting={commentSubmitting}
          editingCommentId={editingCommentId}
          editingContent={editingContent}
          onStartEditComment={handleStartEditComment}
          onEditCommentChange={setEditingContent}
          onCancelEditComment={handleCancelEditComment}
          onUpdateComment={handleUpdateComment}
          deletingCommentId={deletingCommentId}
          onDeleteComment={handleDeleteComment}

          replyTargetCommentId={replyTargetCommentId}
          replyDraftMap={replyDraftMap}
          onToggleReply={handleToggleReply}
          onReplyDraftChange={handleReplyDraftChange}
          onCreateReply={handleCreateReply}
          replyExpandedMap={replyExpandedMap}
          onToggleReplies={handleToggleReplies}
          focusedCommentId={focusedCommentId}
        />
        <div className="mt-8 grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
                            {/* 멤버 목록 */}
                            <section className={`rounded-[32px] border p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur-sm ${palette.section}`}>
                              <div className="mb-5 flex items-center justify-between gap-3">
                                <div>
                                  <p className="text-sm font-extrabold text-slate-800">
                                    멤버 목록
                                  </p>
                                  <p className="text-xs text-slate-500">
                                    지금 이 저금통에 함께 들어와 있는 사람들이에요.
                                  </p>
                                </div>

                                <span className={`rounded-full px-3 py-1 text-xs font-bold ${palette.countChip}`}>
                                  {members.length}명
                                </span>
                              </div>

                              {membersLoading && (
                                <div className="space-y-3">
                                  {[1, 2, 3].map((item) => (
                                    <div
                                      key={item}
                                      className={`animate-pulse rounded-2xl border p-4 ${palette.softCard}`}
                                    >
                                      <div className="flex items-center justify-between gap-4">
                                        <div className="flex items-center gap-3">
                                          <div className="h-12 w-12 rounded-full bg-slate-200" />
                                          <div className="space-y-2">
                                            <div className="h-4 w-24 rounded-full bg-slate-200" />
                                            <div className="h-3 w-32 rounded-full bg-slate-100" />
                                          </div>
                                        </div>
                                        <div className="h-7 w-16 rounded-full bg-slate-200" />
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}

                              {!membersLoading && membersError && (
                                <div className={`rounded-2xl border border-dashed px-4 py-4 text-sm ${palette.emptyBox}`}>
                                  {membersError}
                                </div>
                              )}

                              {!membersLoading && !membersError && sortedMembers.length === 0 && (
                                <div className={`rounded-2xl border border-dashed px-4 py-6 text-center text-sm ${palette.emptyBox}`}>
                                  아직 멤버 정보가 없어요.
                                </div>
                              )}

                              {!membersLoading && !membersError && sortedMembers.length > 0 && (
                                <div className="space-y-3">
                                  {sortedMembers.map((member) => {
                                    const roleChipClass =
                                      member.role === "OWNER"
                                        ? "bg-amber-100 text-amber-700"
                                        : member.role === "ADMIN"
                                        ? "bg-sky-100 text-sky-700"
                                        : "bg-slate-100 text-slate-600";

                                    return (
                                      <div
                                        key={member.userId}
                                        className={`flex flex-col gap-4 rounded-2xl border p-4 sm:flex-row sm:items-center sm:justify-between ${palette.softCard}`}
                                      >
                                        <div className="flex items-center gap-4">
                                          {member.profileImageUrl ? (
                                            <img
                                              src={member.profileImageUrl}
                                              alt={member.name || "멤버 프로필"}
                                              className="h-12 w-12 rounded-full object-cover"
                                            />
                                          ) : (
                                            <div className={`flex h-12 w-12 items-center justify-center rounded-full text-lg font-black ${palette.avatar}`}>
                                              {(member.name || "?").slice(0, 1)}
                                            </div>
                                          )}

                                          <div>
                                            <div className="flex flex-wrap items-center gap-2">
                                              <p className="text-sm font-bold text-slate-800">
                                                {member.name || `사용자 ${member.userId}`}
                                              </p>

                                              {member.userId === jar.ownerId && (
                                                <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-bold text-amber-700">
                                                  소유자
                                                </span>
                                              )}
                                            </div>

                                            <p className="mt-1 text-xs text-slate-500">
                                              참여 시작: {formatDate(member.joinedAt)}
                                            </p>
                                          </div>
                                        </div>

                                        <div className="flex flex-wrap items-center justify-end gap-2">
                                          {canChangeMemberRole && member.role !== "OWNER" ? (
                                            <select
                                              value={member.role}
                                              disabled={roleUpdateLoadingId === member.userId || kickLoadingId === member.userId}
                                              onChange={(e) => {
                                                const nextRole = e.target.value;

                                                if (nextRole === member.role) return;

                                                handleChangeMemberRole(member.userId, nextRole);
                                              }}
                                              className={`rounded-full border px-3 py-2 text-xs font-bold outline-none transition disabled:cursor-not-allowed disabled:opacity-60 ${palette.input}`}
                                            >
                                              <option value="ADMIN">관리자</option>
                                              <option value="MEMBER">멤버</option>
                                            </select>
                                          ) : (
                                            <span
                                              className={`inline-flex w-fit rounded-full px-3 py-1 text-xs font-bold ${roleChipClass}`}
                                            >
                                              {ROLE_LABEL[member.role] || member.role}
                                            </span>
                                          )}

                                          {canKickMembers && member.role !== "OWNER" && (
                                            <button
                                              type="button"
                                              disabled={kickLoadingId === member.userId || roleUpdateLoadingId === member.userId}
                                              onClick={() =>
                                                handleKickMember(member.userId, member.name, member.role)
                                              }
                                              className={`rounded-full px-3 py-2 text-xs font-bold transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60 ${palette.dangerBtn}`}
                                            >
                                              {kickLoadingId === member.userId ? "강퇴 중..." : "강퇴"}
                                            </button>
                                          )}

                                          {roleUpdateLoadingId === member.userId && (
                                            <span className="text-xs font-semibold text-slate-500">
                                              변경 중...
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </section>

                            {/* 초대 관리 */}
                            <section
                              className={`rounded-[32px] border p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur-sm ${palette.section}`}
                            >
                              <div className="mb-5 flex items-center justify-between gap-3">
                                <div>
                                  <p className="text-sm font-extrabold text-slate-800">
                                    초대 관리
                                  </p>
                                  <p className="text-xs text-slate-500">
                                    초대코드를 만들고, 보고, 필요하면 바로 폐기할 수 있어요.
                                  </p>
                                </div>

                                <span className={`rounded-full px-3 py-1 text-xs font-bold ${palette.activeChip}`}>
                                  활성 {activeInviteCount}개
                                </span>
                              </div>

                              {!canManageInvites && (
                                <div className={`rounded-2xl border border-dashed px-4 py-6 text-sm leading-7 ${palette.emptyBox}`}>
                                  초대 관리는 방장(OWNER) 또는 관리자(ADMIN)만 볼 수 있어요.
                                </div>
                              )}

                              {canManageInvites && (
                                <>
                                  <form
                                    onSubmit={handleCreateInvite}
                                    className={`mb-5 rounded-2xl border p-4 ${palette.inviteCard}`}
                                  >
                                    <p className="mb-4 text-sm font-bold text-slate-800">
                                      새 초대코드 만들기
                                    </p>

                                    <div className="grid gap-3 sm:grid-cols-2">
                                      <label className="block">
                                        <span className="mb-2 block text-xs font-semibold text-slate-500">
                                          유효 시간(시간)
                                        </span>
                                        <input
                                          type="number"
                                          min="1"
                                          max="168"
                                          value={inviteForm.expiresInHours}
                                          onChange={(e) =>
                                            setInviteForm((prev) => ({
                                              ...prev,
                                              expiresInHours: e.target.value,
                                            }))
                                          }
                                          className={`w-full rounded-2xl border px-4 py-3 text-sm font-semibold outline-none transition ${palette.input}`}
                                        />
                                      </label>

                                      <label className="block">
                                        <span className="mb-2 block text-xs font-semibold text-slate-500">
                                          최대 사용 횟수
                                        </span>
                                        <input
                                          type="number"
                                          min="1"
                                          max="50"
                                          value={inviteForm.maxUses}
                                          onChange={(e) =>
                                            setInviteForm((prev) => ({
                                              ...prev,
                                              maxUses: e.target.value,
                                            }))
                                          }
                                          className={`w-full rounded-2xl border px-4 py-3 text-sm font-semibold outline-none transition ${palette.input}`}
                                        />
                                      </label>
                                    </div>

                                    <button
                                      type="submit"
                                      disabled={createInviteLoading}
                                      className={`mt-4 w-full rounded-2xl px-4 py-3 text-sm font-bold shadow-md transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60 ${palette.primaryButton}`}
                                    >
                                      {createInviteLoading
                                        ? "초대코드 만드는 중..."
                                        : "초대코드 만들기"}
                                    </button>
                                  </form>

                                  {invitesLoading && (
                                    <div className="space-y-3">
                                      {[1, 2].map((item) => (
                                        <div
                                          key={item}
                                          className={`animate-pulse rounded-2xl border p-4 ${palette.inviteCard}`}
                                        >
                                          <div className="mb-4 flex items-center justify-between gap-4">
                                            <div className="space-y-2">
                                              <div className="h-3 w-20 rounded-full bg-slate-200" />
                                              <div className="h-6 w-32 rounded-full bg-slate-200" />
                                            </div>
                                            <div className="h-7 w-20 rounded-full bg-slate-200" />
                                          </div>
                                          <div className="grid gap-3 sm:grid-cols-2">
                                            <div className="h-20 rounded-2xl bg-white" />
                                            <div className="h-20 rounded-2xl bg-white" />
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  )}

                                  {!invitesLoading && invitesError && (
                                    <div className={`rounded-2xl border border-dashed px-4 py-4 text-sm ${palette.emptyBox}`}>
                                      {invitesError}
                                    </div>
                                  )}

                                  {hiddenRevokedCount > 0 && (
                                    <div
                                      className={`mb-4 flex flex-col gap-3 rounded-2xl border border-dashed px-4 py-4 sm:flex-row sm:items-center sm:justify-between ${palette.hintBox}`}
                                    >
                                      <p className="text-sm">
                                        숨긴 폐기 코드가 <b>{hiddenRevokedCount}개</b> 있어요.
                                      </p>

                                      <button
                                        type="button"
                                        onClick={handleRestoreHiddenInvites}
                                        className={`rounded-2xl border px-4 py-2 text-sm font-bold transition ${palette.outlineButton}`}
                                      >
                                        숨긴 코드 다시 보기
                                      </button>
                                    </div>
                                  )}

                                  {!invitesLoading &&
                                    !invitesError &&
                                    visibleInvites.length === 0 && (
                                      <div
                                        className={`rounded-2xl border border-dashed px-4 py-6 text-center text-sm ${palette.emptyBox}`}
                                      >
                                        보이는 초대코드가 없어요.
                                      </div>
                                    )}

                                  {!invitesLoading &&
                                    !invitesError &&
                                    visibleInvites.length > 0 && (
                                      <>
                                        <div className="space-y-3">
                                          {pagedInvites.map((invite) => {
                                            const status = getInviteStatus(
                                              invite,
                                              palette
                                            );

                                            return (
                                              <div
                                                key={invite.inviteId}
                                                className={`rounded-2xl border p-4 ${palette.inviteCard}`}
                                              >
                                                <div className="flex flex-wrap items-start justify-between gap-3">
                                                  <div>
                                                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                                                      초대코드
                                                    </p>
                                                    <p className="mt-1 text-lg font-black tracking-[0.22em] text-slate-800">
                                                      {invite.code}
                                                    </p>

                                                      {/* 초대코드 밑에 실제 공유할 링크도 같이 보여줘 */}
                                                      <div className={`mt-3 rounded-2xl border px-4 py-3 ${palette.inviteInfoBox}`}>
                                                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                                                          초대 링크
                                                        </p>
                                                        <p className="mt-2 break-all text-sm font-semibold text-slate-700">
                                                          {getInviteUrl(invite.code)}
                                                        </p>
                                                      </div>
                                                  </div>

                                                  <div className="flex items-center gap-2">
                                                    <span
                                                      className={`rounded-full px-3 py-1 text-xs font-bold ${status.className}`}
                                                    >
                                                      {status.label}
                                                    </span>

                                                    {invite.revokedAt && (
                                                      <button
                                                        type="button"
                                                        onClick={() =>
                                                          handleHideRevokedInvite(
                                                            invite.inviteId
                                                          )
                                                        }
                                                        title="화면에서 숨기기"
                                                        aria-label="폐기된 초대코드 숨기기"
                                                        className={`flex h-8 w-8 items-center justify-center rounded-full border text-base font-bold transition ${palette.outlineButton}`}
                                                      >
                                                        ×
                                                      </button>
                                                    )}
                                                  </div>
                                                </div>

                                                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                                                  <InfoItem
                                                    label="만료 시간"
                                                    value={formatDate(
                                                      invite.expiresAt
                                                    )}
                                                    className={
                                                      palette.inviteInfoBox
                                                    }
                                                  />
                                                  <InfoItem
                                                    label="사용 횟수"
                                                    value={`${invite.usedCount} / ${invite.maxUses}`}
                                                    className={
                                                      palette.inviteInfoBox
                                                    }
                                                  />
                                                  <InfoItem
                                                    label="만든 시간"
                                                    value={formatDate(
                                                      invite.createdAt
                                                    )}
                                                    className={
                                                      palette.inviteInfoBox
                                                    }
                                                  />
                                                  <InfoItem
                                                    label="폐기 시간"
                                                    value={formatDate(
                                                      invite.revokedAt
                                                    )}
                                                    className={
                                                      palette.inviteInfoBox
                                                    }
                                                  />
                                                </div>

                                                <div className="mt-4 flex flex-wrap gap-2">
                                                  <button
                                                    type="button"
                                                    onClick={() => handleCopyInviteCode(invite.code)}
                                                    className={`rounded-2xl border px-4 py-2 text-sm font-bold transition ${palette.outlineButton}`}
                                                  >
                                                    코드 복사
                                                  </button>

                                                  <button
                                                    type="button"
                                                    onClick={() => handleCopyInviteUrl(invite.code)}
                                                    className={`rounded-2xl border px-4 py-2 text-sm font-bold transition ${palette.outlineButton}`}
                                                  >
                                                    링크 복사
                                                  </button>

                                                  <button
                                                    type="button"
                                                    onClick={() => handleRevokeInvite(invite.inviteId)}
                                                    disabled={!invite.isActive || revokeLoadingId === invite.inviteId}
                                                    className={`rounded-2xl px-4 py-2 text-sm font-bold transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-50 ${
                                                      invite.isActive
                                                        ? palette.dangerBtn
                                                        : "bg-slate-200 text-slate-500"
                                                    }`}
                                                  >
                                                    {revokeLoadingId === invite.inviteId
                                                      ? "폐기 중..."
                                                      : invite.isActive
                                                      ? "초대코드 폐기"
                                                      : "종료된 코드"}
                                                  </button>
                                                </div>
                                              </div>
                                            );
                                          })}
                                        </div>

                                        <div className="mt-5 flex flex-col gap-3 border-t border-white/60 pt-4 sm:flex-row sm:items-center sm:justify-between">
                                          <p className="text-xs font-semibold text-slate-500">
                                            {invitePage} / {invitePageCount} 페이지
                                          </p>

                                          <div className="flex flex-wrap items-center gap-2">
                                            <button
                                              type="button"
                                              onClick={() =>
                                                setInvitePage((prev) =>
                                                  Math.max(1, prev - 1)
                                                )
                                              }
                                              disabled={invitePage === 1}
                                              className={`rounded-2xl border px-4 py-2 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-50 ${palette.outlineButton}`}
                                            >
                                              이전
                                            </button>

                                            {Array.from(
                                              { length: invitePageCount },
                                              (_, index) => index + 1
                                            ).map((pageNumber) => (
                                              <button
                                                key={pageNumber}
                                                type="button"
                                                onClick={() =>
                                                  setInvitePage(pageNumber)
                                                }
                                                className={`rounded-2xl px-3 py-2 text-sm font-bold transition ${
                                                  pageNumber === invitePage
                                                    ? palette.primaryButton
                                                    : palette.outlineButton
                                                }`}
                                              >
                                                {pageNumber}
                                              </button>
                                            ))}

                                            <button
                                              type="button"
                                              onClick={() =>
                                                setInvitePage((prev) =>
                                                  Math.min(
                                                    invitePageCount,
                                                    prev + 1
                                                  )
                                                )
                                              }
                                              disabled={
                                                invitePage === invitePageCount
                                              }
                                              className={`rounded-2xl border px-4 py-2 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-50 ${palette.outlineButton}`}
                                            >
                                              다음
                                            </button>
                                          </div>
                                        </div>
                                      </>
                                    )}
                                </>
                                )}
                            </section>
                          </div>
                          {editOpen && (
                            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 px-4 py-6">
                              <div className="w-full max-w-2xl rounded-[32px] border border-white/70 bg-white p-6 shadow-2xl">
                                <div className="mb-5 flex items-center justify-between">
                                  <div>
                                    <p className="text-lg font-black text-slate-800">저금통 설정 수정</p>
                                    <p className="mt-1 text-sm text-slate-500">
                                      이름부터 오픈 방식, 잠금 레벨, 오픈일까지 한 번에 바꿀 수 있어요.
                                    </p>
                                  </div>

                                  <button
                                    type="button"
                                    onClick={() => setEditOpen(false)}
                                    className="rounded-full border border-slate-200 px-3 py-1 text-sm font-bold text-slate-500 transition hover:bg-slate-50"
                                  >
                                    닫기
                                  </button>
                                </div>

                                <form onSubmit={handleUpdateJar} className="space-y-4">
                                  <div className="grid gap-4 sm:grid-cols-2">
                                    <label className="block">
                                      <span className="mb-2 block text-xs font-semibold text-slate-500">
                                        저금통 이름
                                      </span>
                                      <input
                                        type="text"
                                        value={editForm.name}
                                        onChange={(e) =>
                                          setEditForm((prev) => ({ ...prev, name: e.target.value }))
                                        }
                                        className={`w-full rounded-2xl border px-4 py-3 text-sm font-semibold outline-none transition ${palette.input}`}
                                      />
                                    </label>

                                    <label className="block">
                                      <span className="mb-2 block text-xs font-semibold text-slate-500">
                                        최대 인원
                                      </span>
                                      <input
                                        type="number"
                                        min="2"
                                        max="50"
                                        value={editForm.maxMembers}
                                        onChange={(e) =>
                                          setEditForm((prev) => ({ ...prev, maxMembers: e.target.value }))
                                        }
                                        className={`w-full rounded-2xl border px-4 py-3 text-sm font-semibold outline-none transition ${palette.input}`}
                                      />
                                    </label>
                                  </div>

                                  <label className="block">
                                    <span className="mb-2 block text-xs font-semibold text-slate-500">
                                      설명
                                    </span>
                                    <textarea
                                      rows="4"
                                      value={editForm.description}
                                      onChange={(e) =>
                                        setEditForm((prev) => ({ ...prev, description: e.target.value }))
                                      }
                                      className={`w-full rounded-2xl border px-4 py-3 text-sm font-semibold outline-none transition ${palette.input}`}
                                    />
                                  </label>

                                  <div className="grid gap-4 sm:grid-cols-2">
                                    <label className="block">
                                      <span className="mb-2 block text-xs font-semibold text-slate-500">
                                        테마
                                      </span>
                                      <select
                                        value={editForm.theme}
                                        onChange={(e) =>
                                          setEditForm((prev) => ({ ...prev, theme: e.target.value }))
                                        }
                                        className={`w-full rounded-2xl border px-4 py-3 text-sm font-semibold outline-none transition ${palette.input}`}
                                      >
                                        {Object.entries(THEME_LABEL).map(([value, label]) => (
                                          <option key={value} value={value}>
                                            {label}
                                          </option>
                                        ))}
                                      </select>
                                    </label>

                                    <label className="block">
                                      <span className="mb-2 block text-xs font-semibold text-slate-500">
                                        공개 방식
                                      </span>
                                      <select
                                        value={editForm.openMode}
                                        onChange={(e) =>
                                          setEditForm((prev) => ({ ...prev, openMode: e.target.value }))
                                        }
                                        className={`w-full rounded-2xl border px-4 py-3 text-sm font-semibold outline-none transition ${palette.input}`}
                                      >
                                        {Object.entries(OPEN_MODE_LABEL).map(([value, label]) => (
                                          <option key={value} value={value}>
                                            {label}
                                          </option>
                                        ))}
                                      </select>
                                    </label>

                                    <label className="block">
                                      <span className="mb-2 block text-xs font-semibold text-slate-500">
                                        잠금 레벨
                                      </span>
                                      <select
                                        value={editForm.lockLevel}
                                        onChange={(e) =>
                                          setEditForm((prev) => ({ ...prev, lockLevel: e.target.value }))
                                        }
                                        className={`w-full rounded-2xl border px-4 py-3 text-sm font-semibold outline-none transition ${palette.input}`}
                                      >
                                        {Object.entries(LOCK_LEVEL_LABEL).map(([value, label]) => (
                                          <option key={value} value={value}>
                                            {label}
                                          </option>
                                        ))}
                                      </select>
                                    </label>

                                    <label className="block">
                                      <span className="mb-2 block text-xs font-semibold text-slate-500">
                                        오픈일
                                      </span>
                                      <input
                                        type="datetime-local"
                                        value={editForm.openAt}
                                        onChange={(e) =>
                                          setEditForm((prev) => ({ ...prev, openAt: e.target.value }))
                                        }
                                        className={`w-full rounded-2xl border px-4 py-3 text-sm font-semibold outline-none transition ${palette.input}`}
                                      />
                                    </label>
                                  </div>

                                  <div className="flex flex-wrap justify-end gap-3 pt-2">
                                    <button
                                      type="button"
                                      onClick={() => setEditOpen(false)}
                                      className={`rounded-2xl border px-4 py-3 text-sm font-bold transition ${palette.outlineBtn}`}
                                    >
                                      취소
                                    </button>

                                    <button
                                      type="submit"
                                      disabled={editLoading}
                                      className={`rounded-2xl px-4 py-3 text-sm font-bold shadow-md transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60 ${palette.primaryButton}`}
                                    >
                                      {editLoading ? "수정하는 중..." : "설정 저장하기"}
                                    </button>
                                  </div>
                                </form>
                              </div>
                            </div>
                          )}
      </div>
    </div>
  );
}