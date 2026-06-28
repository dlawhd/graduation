/*
 * jarDetailUtils 역할
 *
 * 저금통 상세 화면에서 여러 곳이 같이 쓰는
 * 작은 계산 함수들을 모아둔 파일이야.
 *
 * 쉽게 말하면:
 * - 로그인 사용자 id를 안전하게 꺼내고
 * - 댓글 목록을 안전한 배열로 바꾸고
 * - 댓글 개수를 세고
 * - 쪽지 태그를 배열로 맞춰주는 도구들이야.
 */

/*
 * me 응답에서 현재 로그인한 사용자 id를 안전하게 꺼내는 함수야.
 *
 * 백엔드 응답이 userId일 수도 있고 id일 수도 있으니 둘 다 대응해.
 */
export function getCurrentUserIdFromMe(me) {
  const value = me?.userId ?? me?.id;

  if (value === null || value === undefined) {
    return null;
  }

  const numberValue = Number(value);

  return Number.isFinite(numberValue) ? numberValue : null;
}

export function normalizeCommentNode(comment) {
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
 * 이 함수는 댓글 응답을 "항상 트리 형태"로 안전하게 맞춰주는 역할을 해.
 *
 * 백엔드가
 * - 배열로 줄 수도 있고
 * - { items: [...] } 형태로 줄 수도 있어서
 * 먼저 items를 꺼내고,
 * replies도 항상 배열로 맞춰줘.
 */
export function normalizeCommentItems(payload) {
  const rawItems = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.items)
    ? payload.items
    : [];

  return rawItems.map(normalizeCommentNode);
}

/*
 * 댓글 총 개수를 세는 함수야.
 * 부모 댓글 + 대댓글까지 전부 더해줘.
 */
export function getTotalCommentCount(comments) {
  if (!Array.isArray(comments) || comments.length === 0) return 0;

  return comments.reduce((total, comment) => {
    return total + 1 + getTotalCommentCount(comment.replies || []);
  }, 0);
}

// 댓글 내용을 안전하게 정리하는 함수
export function normalizeCommentContent(value) {
  return typeof value === "string" ? value.trim() : "";
}

// 특정 댓글이 댓글 트리 어디에 있는지 "길"을 찾아주는 함수
// 예:
// 부모 댓글 10 아래 답글 21 이 있으면 [10, 21] 반환
export function findCommentPath(comments, targetCommentId, parents = []) {
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

// 쪽지 목록 응답이 배열일 수도 있고, items 형태일 수도 있어서 맞춰주는 함수
export function normalizeJarZoomNotes(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }

  return Array.isArray(payload?.items) ? payload.items : [];
}

export function normalizeJarZoomTags(tags) {
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

export function toSafeNoteText(value) {
  return typeof value === "string" ? value.trim() : "";
}