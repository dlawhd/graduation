import test from "node:test";
import assert from "node:assert/strict";
import { shapePage, SHAPE_PAGE_SIZE } from "./shapePaging.mjs";
import { SHAPES } from "./drawingTools.mjs";
import { CHARACTER_SHAPES } from "./characterShapes.mjs";

test("전체 30개 도형을 16개와 14개로 나누며 중복·누락 없이 유지한다", () => {
  const entries = [...SHAPES, ...CHARACTER_SHAPES];
  const first = shapePage(entries, 1), second = shapePage(entries, 2);
  assert.equal(SHAPE_PAGE_SIZE, 16);
  assert.equal(first.items.length, 16); assert.equal(second.items.length, 14);
  assert.equal(first.totalPages, 2);
  assert.deepEqual([...first.items, ...second.items], entries);
});

test("틀 17종·기본 도형 18종·캐릭터 12종의 각 페이지 크기를 제한한다", () => {
  for (const entries of [SHAPES.filter(([id]) => id !== "line"), SHAPES, CHARACTER_SHAPES]) {
    const { totalPages } = shapePage(entries);
    for (let page = 1; page <= totalPages; page++) assert.ok(shapePage(entries, page).items.length <= 16);
  }
  assert.equal(shapePage(CHARACTER_SHAPES).totalPages, 1);
  assert.equal(shapePage(SHAPES, 2).items.length, 2);
});

test("잘못된 페이지와 빈 목록을 안전하게 처리하며 입력을 변경하지 않는다", () => {
  const original = structuredClone(CHARACTER_SHAPES);
  for (const page of [-5, 0, 99, NaN, Infinity]) assert.equal(shapePage(CHARACTER_SHAPES, page).page, 1);
  assert.deepEqual(shapePage([], 2), { page: 1, totalPages: 1, items: [] });
  assert.deepEqual(CHARACTER_SHAPES, original);
});
