import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const css = await readFile(new URL("./interactionFeedback.css", import.meta.url),"utf8");
test("마우스 hover는 터치와 분리하고 비활성·사용자 정의 효과를 제외한다", () => {
  assert.match(css, /@media \(hover: hover\) and \(pointer: fine\)/);
  for(const guard of [':not(:disabled)',':not([disabled])',':not([aria-disabled="true"])',':not([class*="hover:"])',':not([data-hover-feedback="custom"])',':not([tabindex="-1"])']) assert.ok(css.includes(guard));
});
test("기본 hover는 위치·선택 그림자를 바꾸지 않고 키보드·모션 감소 설정을 보존한다", () => {
  assert.doesNotMatch(css, /(?:transform|box-shadow|border-width)\s*:/);
  assert.match(css, /:hover:not\(:focus-visible\)/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /transition: none/);
  assert.match(css, /:focus-visible/);
});
