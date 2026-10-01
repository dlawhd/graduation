import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { getGenerationFailureGuidance } from "./generationFailure.mjs";

test("현재 서버 오류 enum 전체가 프론트의 안정 확인 코드로 연결된다", () => {
  const source = readFileSync(new URL("../../../../src/main/java/shop/esjh/memoryjar/enums/ai/JarAiGenerationErrorCode.java", import.meta.url), "utf8");
  const codes = [...source.matchAll(/\b([A-Z][A-Z0-9_]+)\s*[,}]/g)].map((match) => match[1]);
  assert.ok(codes.length >= 17);
  for (const code of codes) assert.equal(getGenerationFailureGuidance(code).diagnosticCode, code);
});

test("정책 거절은 사용자의 원본이 부적절하다고 단정하거나 즉시 재시도를 권하지 않는다", () => {
  const result = getGenerationFailureGuidance("PROVIDER_CONTENT_POLICY_REJECTED");
  assert.equal(result.badge, "정책 거절");
  assert.match(result.message, /원본이 부적절하다고 단정할 수는 없어요/);
  assert.equal(result.canRetry, false);
});

test("제공자 거절과 후보 심사 거절·심사 장애는 서로 다른 안내를 사용한다", () => {
  const provider = getGenerationFailureGuidance("PROVIDER_CONTENT_POLICY_REJECTED");
  const rejected = getGenerationFailureGuidance("CANDIDATE_CONTENT_POLICY_REJECTED");
  const unavailable = getGenerationFailureGuidance("CANDIDATE_MODERATION_UNAVAILABLE");
  assert.notEqual(provider.title, rejected.title);
  assert.match(rejected.message, /원본이 거절됐다는 뜻은 아니며/);
  assert.match(unavailable.message, /정책 위반으로 판정된 것은 아니에요/);
  assert.equal(rejected.canRetry, false);
  assert.equal(unavailable.canRetry, true);
});

test("할당량·입력·설정 오류에는 같은 요청의 빠른 재시도를 제공하지 않는다", () => {
  for (const code of ["PROVIDER_QUOTA_EXCEEDED", "PROVIDER_INPUT_INVALID", "PROVIDER_CONFIGURATION_UNAVAILABLE", "PROVIDER_RATE_LIMITED"]) {
    assert.equal(getGenerationFailureGuidance(code).canRetry, false);
  }
  assert.match(getGenerationFailureGuidance("PROVIDER_QUOTA_EXCEEDED").message, /반복해도 해결되지 않을 수/);
});

test("확인된 일시 장애만 사용자가 누르는 재시도 대상으로 안내한다", () => {
  for (const code of ["PROVIDER_CAPACITY_EXCEEDED", "PROVIDER_TIMEOUT", "GENERATION_TIMEOUT", "GENERATION_QUEUE_FULL", "S3_UPLOAD_FAILED"]) {
    const result = getGenerationFailureGuidance(code);
    assert.equal(result.canRetry, true);
    assert.equal(result.diagnosticCode, code);
  }
});

test("과거 일반 오류는 정책 차단으로 소급 판단하지 않는다", () => {
  for (const code of ["PROVIDER_REQUEST_FAILED", "INTERNAL_ERROR"]) {
    const result = getGenerationFailureGuidance(code);
    assert.match(result.message, /정확한 실패 사유를 확인하지 못했어요/);
    assert.equal(result.diagnosticCode, code);
    assert.equal(result.canRetry, false);
  }
});

test("누락·새 코드·악의적인 문자열은 원문을 노출하지 않는 일반 안내로 돌아간다", () => {
  for (const value of [null, undefined, "NEW_PROVIDER_ERROR", "__proto__", "toString", "DO_NOT_SHOW_TEST_DETAIL<script>", { message: "DO_NOT_SHOW_TEST_DETAIL" }]) {
    const result = getGenerationFailureGuidance(value);
    assert.equal(result.diagnosticCode, "UNKNOWN_ERROR");
    assert.equal(result.canRetry, false);
    assert.doesNotMatch(JSON.stringify(result), /DO_NOT_SHOW_TEST_DETAIL|<script>/);
  }
});
