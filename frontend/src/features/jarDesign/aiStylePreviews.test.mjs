import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { AI_STYLE_PREVIEWS } from "./aiStylePreviews.mjs";

test("스타일 식별자와 순서는 기존 API 계약을 유지한다", () => {
  assert.deepEqual(AI_STYLE_PREVIEWS.map((style) => style.id),
    ["CUTE_2D", "SOFT_25D", "WATERCOLOR", "HAND_DRAWN", "WEIRDO", "PIXEL",
      "NEON_DRAWING", "CHROME_MIRROR", "RISO_PRINT"]);
});

test("아홉 스타일은 고유한 설명과 경량 WebP 예시를 가진다", () => {
  assert.equal(new Set(AI_STYLE_PREVIEWS.map((style) => style.image)).size, 9);
  assert.equal(new Set(AI_STYLE_PREVIEWS.map((style) => style.description)).size, 9);
  for (const style of AI_STYLE_PREVIEWS) {
    assert.ok(style.title && style.description.length > 20);
    const path = new URL("../../../public" + style.image, import.meta.url);
    assert.ok(statSync(path).size < 20_000);
    assert.equal(readFileSync(path).toString("ascii", 8, 12), "WEBP");
  }
});
