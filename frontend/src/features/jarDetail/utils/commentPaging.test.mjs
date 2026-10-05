import test from "node:test";
import assert from "node:assert/strict";
import { buildCommentTree, mergeCommentPages, countCommentTree, commentPath } from "./commentPaging.mjs";

test("different pages join replies without duplicates", () => {
  const initial = [{ commentId: 1, parentCommentId: null }, { commentId: 2, parentCommentId: 1 }];
  const next = [{ commentId: 2, parentCommentId: 1 }, { commentId: 3, parentCommentId: 2 }];
  const rows = mergeCommentPages(initial, next);
  const tree = buildCommentTree(rows);
  assert.equal(rows.length, 3);
  assert.equal(countCommentTree(tree), 3);
  assert.deepEqual(commentPath(tree, 3), [1, 2, 3]);
});

test("10,000 deep replies do not use recursive counting or path search", () => {
  const tree = buildCommentTree(Array.from({ length: 10000 }, (_, index) => ({ commentId: index + 1, parentCommentId: index || null })));
  assert.equal(countCommentTree(tree), 10000);
  assert.equal(commentPath(tree, 10000).length, 10000);
});

test("partial or empty responses remain usable", () => {
  assert.deepEqual(buildCommentTree([]), []);
  assert.deepEqual(commentPath([], 1), null);
  assert.equal(countCommentTree(buildCommentTree([{ commentId: 3, parentCommentId: 2 }])), 1);
});
