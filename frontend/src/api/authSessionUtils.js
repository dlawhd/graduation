// src/api/authSessionUtils.js

/*
 * authSessionUtils 역할
 *
 * Access Token뿐 아니라 Refresh Token까지 만료되어
 * 사용자가 다시 로그인해야 하는 상황을 구분한다.
 *
 * 일반적인 서버 오류와 로그인 만료를 구분하면
 * 서버의 기술적인 오류 문구를 그대로 노출하지 않고
 * 사용자에게 알맞은 로그인 안내 화면을 보여줄 수 있다.
 */

// App에 로그인 만료 사실을 전달할 브라우저 이벤트 이름
export const AUTH_SESSION_EXPIRED_EVENT =
  "memoryjar:session-expired";

// API 오류 객체에 기록할 로그인 만료 구분값
const SESSION_EXPIRED_REASON =
  "SESSION_EXPIRED";

/*
 * Refresh Token 갱신까지 실패한 오류에
 * 로그인 만료 표시를 추가한다.
 */
export function markSessionExpiredError(
  error
) {
  const markedError =
    error && typeof error === "object"
      ? error
      : new Error(
          "로그인 세션이 만료됐어요."
        );

  markedError.authReason =
    SESSION_EXPIRED_REASON;

  return markedError;
}

/*
 * 전달받은 오류가 로그인 만료 오류인지 확인한다.
 */
export function isSessionExpiredError(
  error
) {
  return (
    error?.authReason ===
    SESSION_EXPIRED_REASON
  );
}

/*
 * App에 로그인 세션이 만료됐다고 알린다.
 *
 * App은 이 이벤트를 받으면:
 * - 기존 사용자 정보 제거
 * - 프로필 패널 닫기
 * - 알림 패널 닫기
 *
 * 등을 처리한다.
 */
export function notifySessionExpired() {
  if (
    typeof window === "undefined"
  ) {
    return;
  }

  window.dispatchEvent(
    new Event(
      AUTH_SESSION_EXPIRED_EVENT
    )
  );
}