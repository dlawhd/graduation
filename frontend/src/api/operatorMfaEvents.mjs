/** 서버의 추가 인증 만료만 알린다. 인증 번호·등록 키·복구 코드는 이벤트나 브라우저 저장소에 넣지 않는다. */
export const OPERATOR_MFA_REQUIRED_EVENT = "memoryjar:operator-mfa-required";
export function notifyOperatorMfaRequired(error) {
  if (error?.response?.data?.error?.code === "OPERATOR_MFA_REQUIRED" && typeof window !== "undefined") {
    window.dispatchEvent(new Event(OPERATOR_MFA_REQUIRED_EVENT));
  }
}
