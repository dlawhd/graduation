import { formatDate } from "../utils/jarDetailDateUtils";
import { getTotalCommentCount } from "../utils/jarDetailUtils";

/*
 * getFocusedCommentClass 역할
 *
 * 알림에서 특정 댓글로 들어왔을 때
 * 그 댓글을 잠깐 초록색 테두리로 강조해주는 클래스 문자열을 돌려주는 함수야.
 *
 * 쉽게 말하면:
 * - 강조 대상 댓글이면 초록색 효과를 준다.
 * - 아니면 아무 효과도 주지 않는다.
 */
function getFocusedCommentClass(isFocused) {
  if (!isFocused) return "";

  return "ring-2 ring-emerald-300 bg-emerald-50/70";
}

/*
 * CommentItem 역할
 *
 * 댓글 1개를 화면에 보여주는 컴포넌트야.
 *
 * 핵심:
 * - 일반 댓글도 보여주고
 * - 답글도 보여주고
 * - 답글의 답글도 계속 보여줄 수 있어.
 *
 * 쉽게 말하면:
 * 댓글 안에 replies가 있으면
 * 그 replies도 다시 CommentItem으로 그려서
 * 몇 단계 답글이든 같은 모양으로 보여주는 구조야.
 */
function CommentItem({
  comment,
  depth = 0,
  palette,
  currentUserId,
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
  // 현재 댓글이 내 댓글인지 확인한다.
  const isMine = Number(comment.userId) === Number(currentUserId);

  // 현재 댓글이 수정 모드인지 확인한다.
  const isEditing = editingCommentId === comment.commentId;

  // replies가 없으면 빈 배열로 맞춰서 화면이 터지지 않게 한다.
  const replies = Array.isArray(comment.replies) ? comment.replies : [];

  // 답글 개수는 답글의 답글까지 전부 세어준다.
  const replyCount = getTotalCommentCount(replies);

  // 이 댓글 아래 답글 목록이 펼쳐져 있는지 확인한다.
  const isReplyExpanded = !!replyExpandedMap[comment.commentId];

  // 최상위 댓글과 답글 카드 색을 살짝 다르게 보여준다.
  const cardClass = depth === 0 ? palette.softCard : palette.panelSoft;

  return (
    <div
      className={
        depth === 0
          ? "space-y-3"
          : "ml-6 space-y-3 border-l-2 border-slate-200 pl-4"
      }
    >
      <div
        id={`jar-comment-${comment.commentId}`}
        className={`rounded-2xl border p-4 ${cardClass} ${getFocusedCommentClass(
          Number(focusedCommentId) === Number(comment.commentId)
        )}`}
      >
        {/* 작성자 / 작성시간 / 수정 / 삭제 */}
        <div className="mb-2 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-black text-slate-800">
              {comment.authorName || `사용자 ${comment.userId}`}
            </p>

            <p className="text-[11px] font-semibold text-slate-400">
              {formatDate(comment.createdAt)}
            </p>
          </div>

          {isMine && !isEditing && (
            <div className="flex items-center gap-2">
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
                {deletingCommentId === comment.commentId
                  ? "삭제 중..."
                  : "삭제"}
              </button>
            </div>
          )}
        </div>

        {/* 일반 보기 모드 */}
        {!isEditing && (
          <p className="text-sm leading-7 text-slate-700">
            {comment.content}
          </p>
        )}

        {/* 수정 모드 */}
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

        {/* 답글 / 답글 보기 버튼 */}
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => onToggleReply(comment.commentId)}
            className="text-xs font-bold text-slate-500 transition hover:text-slate-700"
          >
            {replyTargetCommentId === comment.commentId
              ? "답글 닫기"
              : "답글 달기"}
          </button>

          {replyCount > 0 && (
            <button
              type="button"
              onClick={() => onToggleReplies(comment.commentId)}
              className="text-xs font-bold text-slate-500 transition hover:text-slate-700"
            >
              {isReplyExpanded ? "답글 숨기기" : `답글 ${replyCount}개 보기`}
            </button>
          )}
        </div>

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

      {/* 답글 목록 */}
      {replyCount > 0 && isReplyExpanded && (
        <div className="space-y-3">
          {replies.map((reply) => (
            <CommentItem
              key={reply.commentId}
              comment={reply}
              depth={depth + 1}
              palette={palette}
              currentUserId={currentUserId}
              submitting={submitting}
              editingCommentId={editingCommentId}
              editingContent={editingContent}
              onStartEdit={onStartEdit}
              onEditChange={onEditChange}
              onCancelEdit={onCancelEdit}
              onUpdate={onUpdate}
              deletingCommentId={deletingCommentId}
              onDelete={onDelete}
              replyTargetCommentId={replyTargetCommentId}
              replyDraftMap={replyDraftMap}
              onToggleReply={onToggleReply}
              onReplyDraftChange={onReplyDraftChange}
              onCreateReply={onCreateReply}
              replyExpandedMap={replyExpandedMap}
              onToggleReplies={onToggleReplies}
              focusedCommentId={focusedCommentId}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/*
 * CommentSection 역할
 *
 * 쪽지 상세 모달 아래에서
 * 댓글 목록 / 댓글 작성 / 댓글 수정 / 댓글 삭제 UI를 보여주는 컴포넌트야.
 *
 * 댓글 규칙:
 * - 저금통 active 멤버만 가능
 * - 오픈 전에도 댓글 가능
 * - 작성자 본인만 수정/삭제 가능
 * - 오래된 댓글이 위, 새 댓글이 아래
 */
export default function CommentSection({
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
  const safeComments = Array.isArray(comments) ? comments : [];
  const totalCommentCount = getTotalCommentCount(safeComments);

  return (
    <div className="mt-5">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
          댓글
        </p>

        <span
          className={`rounded-full px-3 py-1 text-[11px] font-bold ${palette.countChip}`}
        >
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
        <div
          className={`mt-4 rounded-2xl border border-dashed px-4 py-4 text-sm ${palette.emptyBox}`}
        >
          {error}
        </div>
      )}

      {!loading && !error && safeComments.length === 0 && (
        <div
          className={`mt-4 rounded-2xl border border-dashed px-4 py-6 text-center text-sm ${palette.emptyBox}`}
        >
          아직 댓글이 없어요.
        </div>
      )}

      {!loading && !error && safeComments.length > 0 && (
        <div className="mt-4 space-y-4">
          {safeComments.map((comment) => (
            <CommentItem
              key={comment.commentId}
              comment={comment}
              depth={0}
              palette={palette}
              currentUserId={currentUserId}
              submitting={submitting}
              editingCommentId={editingCommentId}
              editingContent={editingContent}
              onStartEdit={onStartEdit}
              onEditChange={onEditChange}
              onCancelEdit={onCancelEdit}
              onUpdate={onUpdate}
              deletingCommentId={deletingCommentId}
              onDelete={onDelete}
              replyTargetCommentId={replyTargetCommentId}
              replyDraftMap={replyDraftMap}
              onToggleReply={onToggleReply}
              onReplyDraftChange={onReplyDraftChange}
              onCreateReply={onCreateReply}
              replyExpandedMap={replyExpandedMap}
              onToggleReplies={onToggleReplies}
              focusedCommentId={focusedCommentId}
            />
          ))}
        </div>
      )}
    </div>
  );
}