/** 평탄한 댓글 페이지를 연결한다. 부모와 자식이 다른 페이지에 있어도 깊이 제한 없이 조립한다. */
export function buildCommentTree(items = []) {
  const nodes = new Map(items.map(item => [Number(item.commentId), { ...item, replies: [] }]));
  const roots = [];
  for (const node of nodes.values()) {
    const parent = nodes.get(Number(node.parentCommentId));
    if (parent && parent !== node) parent.replies.push(node);
    else roots.push(node);
  }
  return roots;
}

/** 페이지/알림 경로가 겹쳐도 같은 댓글을 중복 표시하지 않는다. */
export function mergeCommentPages(previous, incoming) {
  return [...new Map([...previous, ...incoming].map(item => [Number(item.commentId), item])).values()]
    .sort((a, b) => Number(a.commentId) - Number(b.commentId));
}

export function countCommentTree(comments = []) {
  const pending = [...comments];
  const seen = new Set();
  while (pending.length) {
    const node = pending.pop();
    if (seen.has(node)) continue;
    seen.add(node);
    for (const reply of node.replies || []) pending.push(reply);
  }
  return seen.size;
}

/** 경로 배열을 매 단계 복사하지 않고 부모 링크를 따라 마지막에 한 번 조립한다. */
export function commentPath(comments, target, prefix = []) {
  const pending = comments.map(node => ({ node, parent: null }));
  const seen = new Set();
  while (pending.length) {
    const entry = pending.pop();
    if (seen.has(entry.node)) continue;
    seen.add(entry.node);
    if (Number(entry.node.commentId) === Number(target)) {
      const result = [];
      for (let current = entry; current; current = current.parent) result.push(Number(current.node.commentId));
      return [...prefix, ...result.reverse()];
    }
    for (const node of entry.node.replies || []) pending.push({ node, parent: entry });
  }
  return null;
}
