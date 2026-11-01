import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequestGate } from "./requestGate.mjs";

test("마지막 요청만 성공·오류·로딩 상태를 갱신할 수 있다", () => {
  const gate = createRequestGate();
  const first = gate.begin("detail"), second = gate.begin("detail");
  assert.equal(first(), false); assert.equal(second(), true);
  const list = gate.begin("list");
  assert.equal(second(), true); assert.equal(list(), true);
});

test("화면 이동·로그아웃·StrictMode 재실행 뒤 이전 응답은 다시 유효해지지 않는다", () => {
  const gate = createRequestGate(), before = gate.begin("notifications");
  gate.invalidate(); assert.equal(before(), false);
  const whileClosed = gate.begin("notifications"); assert.equal(whileClosed(), false);
  gate.activate();
  assert.equal(whileClosed(), false);
  const after = gate.begin("notifications");
  assert.equal(before(), false); assert.equal(whileClosed(), false); assert.equal(after(), true);
});
