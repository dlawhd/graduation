import test from "node:test";
import assert from "node:assert/strict";
import { canSubmitInquiry, inquiryButtonLabel, supportNotificationPath, SUPPORT_STATUS } from "./supportView.mjs";

test("원본 공유 동의와 미리보기가 모두 있어야 문의 접수 가능", () => {
  assert.equal(canSubmitInquiry("문의", false, true, false), false);
  assert.equal(canSubmitInquiry("문의", true, false, false), false);
  assert.equal(canSubmitInquiry("문의", true, true, true), false);
  assert.equal(canSubmitInquiry("  ", true, true, false), false);
  assert.equal(canSubmitInquiry("가".repeat(1001), true, true, false), false);
  assert.equal(canSubmitInquiry("문의", true, true, false), true);
});
test("접수된 후보는 다시 접수 버튼 대신 문의 보기", () => {
  for (const status of ["OPEN", "IN_PROGRESS", "ANSWERED"]) assert.equal(inquiryButtonLabel({ status }), "접수한 문의 보기");
  assert.equal(inquiryButtonLabel({ status: "COPYING" }), "접수 상태 확인");
  assert.equal(inquiryButtonLabel({ status: "COPY_FAILED" }), "운영자에게 문의하기");
  assert.equal(inquiryButtonLabel(null), "운영자에게 문의하기");
});
test("문의 답변 알림만 유효한 번호로 내 문의 상세에 이동", () => {
  assert.equal(supportNotificationPath({ type: "SUPPORT_REPLIED", inquiryId: 11 }), "/support/inquiries/11");
  for (const inquiryId of [null, -1, 0, "../../admin", "11"]) assert.equal(supportNotificationPath({ type: "SUPPORT_REPLIED", inquiryId }), null);
  assert.equal(supportNotificationPath({ type: "NOTE_COMMENTED", inquiryId: 11 }), null);
  assert.equal(SUPPORT_STATUS.ANSWERED, "답변 완료");
});
