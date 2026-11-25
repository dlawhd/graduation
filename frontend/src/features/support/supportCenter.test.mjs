import test from "node:test";
import assert from "node:assert/strict";
import { supportCenterPaths, supportInquiryId, filterSupportFaq } from "./supportCenter.mjs";
import { requiresNewSupportAttachmentRequest } from "./supportView.mjs";

test("메뉴에는 허용된 문제 화면 정보만 전달하고 검색·외부 경로는 제외한다", () => {
  const safe = supportCenterPaths("?from=%2Fjars%2F91&jarId=91&q=secret&category=OTHER&inquiry=9&errorCode=HTTP_500");
  const q = new URL(safe.new, "https://example.invalid").searchParams;
  assert.equal(q.get("from"), "/jars/91"); assert.equal(q.get("jarId"), "91"); assert.equal(q.get("errorCode"), "HTTP_500");
  for (const key of ["q", "category", "inquiry"]) assert.equal(q.has(key), false);
  for (const from of ["https://attacker.invalid", "//attacker.invalid", "/admin/support/inquiries", "/jars/91?token=private"]) {
    assert.equal(new URL(supportCenterPaths(`?from=${encodeURIComponent(from)}`).new, "https://example.invalid").searchParams.has("from"), false);
  }
  assert.equal(safe.login, "/support/login-help"); assert.equal(safe.inquiries, "/support/inquiries");
});
test("문의 번호는 양수인 안전한 정수만 받는다", () => {
  for (const value of [undefined, "", "0", "-1", "1e2", "1.5", "../1", "9007199254740992"]) assert.equal(supportInquiryId(value), null);
  assert.equal(supportInquiryId("128"), 128);
});
test("FAQ는 제목·내용·유형에서 검색하며 주제와 교차 필터한다", () => {
  const rows = [{ category: "PHOTO_UPLOAD", question: "사진 업로드", answer: "PNG 파일" }, { category: "LOGIN_ACCOUNT", question: "로그인", answer: "같은 브라우저" }];
  assert.equal(filterSupportFaq(rows, " png ", "").length, 1);
  assert.equal(filterSupportFaq(rows, "사진", "LOGIN_ACCOUNT").length, 0);
  assert.equal(filterSupportFaq(rows, "로그인 및 계정", "LOGIN_ACCOUNT").length, 1);
  assert.equal(filterSupportFaq(rows, "", "").length, 2);
});
test("첨부의 불확실한 저장 결과는 같은 번호로 복구하고 확정 실패만 새 번호를 사용한다", () => {
  for (const status of [undefined, 0, 400, 401, 403, 409, 413, 429, 500, 502, 503, 504]) assert.equal(requiresNewSupportAttachmentRequest({ response: { status } }), false);
  assert.equal(requiresNewSupportAttachmentRequest({ response: { status: 422 } }), true);
  assert.equal(requiresNewSupportAttachmentRequest(new Error("network error")), false);
});
