import test from "node:test";
import assert from "node:assert/strict";
import { noteViewScope } from "./noteViewScope.mjs";

test("열리기 전에는 전체 탭·잘못된 범위를 요청해도 본인 전용 조회로 고정한다", () => {
  for (const requested of ["ALL", "MINE", null, undefined, "other"]) {
    assert.equal(noteViewScope(false, requested), "MINE");
  }
});
test("열린 뒤에는 전체 쪽지와 내 쪽지를 각각 선택한다", () => {
  assert.equal(noteViewScope(true, "ALL"), "ALL");
  assert.equal(noteViewScope(true, "MINE"), "MINE");
});
