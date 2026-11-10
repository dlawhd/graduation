import apiClient, { ensureCsrf } from "./apiClient";

const BASE = "/api/v1/admin/support/mfa";
/** 운영자 추가 인증도 공통 쿠키·CSRF·세션 갱신을 사용한다. 키를 URL에 포함하지 않는다. */
export async function getOperatorMfa(options = {}) {
  return (await apiClient.get(BASE, options)).data?.data;
}
export async function sendOperatorMfa(action, data = {}, options = {}) {
  const allowed = ["enrollment", "confirmation", "verification", "recovery-codes", "lock"];
  if (!allowed.includes(action)) throw new Error("지원하지 않는 인증 요청입니다.");
  await ensureCsrf();
  if (options.signal?.aborted) throw new DOMException("요청 취소", "AbortError");
  return (await apiClient.post(`${BASE}/${action}`, data, options)).data?.data;
}
