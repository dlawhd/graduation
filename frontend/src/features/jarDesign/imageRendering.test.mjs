import test from "node:test";
import assert from "node:assert/strict";
import { designImageRendering, draftImageRendering } from "./imageRendering.mjs";

test("픽셀만 선명하게 표시하고 원본·다른 스타일·구버전 응답은 일반 표시한다", () => {
  assert.equal(designImageRendering("PIXEL"), "pixelated");
  assert.equal(designImageRendering("CUTE_2D"), "auto");
  assert.equal(designImageRendering(undefined), "auto");
  const draft = { selectedDesignType: "AI", selectedGenerationId: 2,
    generations: [{ generationId: 1, style: "CUTE_2D" }, { generationId: 2, style: "PIXEL" }] };
  assert.equal(draftImageRendering(draft), "pixelated");
  assert.equal(draftImageRendering({ ...draft, selectedGenerationId: 1 }), "auto");
  assert.equal(draftImageRendering({ ...draft, selectedDesignType: "ORIGINAL" }), "auto");
});
