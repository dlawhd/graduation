// src/api/onboardingApi.js

import apiClient, { fetchCsrf } from "./apiClient";

/*
 * onboardingApi.js 역할
 *
 * Memory Jar 이용 방법 안내의 진행 상태를
 * 백엔드에서 조회하고 저장하는 API 함수들을 관리한다.
 *
 * 쉽게 말하면:
 *
 * 1. 이 사용자가 어떤 튜토리얼을 이미 봤는지 조회
 * 2. 사용자가 튜토리얼을 완료했는지 저장
 * 3. 사용자가 튜토리얼을 건너뛰었는지 저장
 *
 * 하는 역할을 담당한다.
 *
 * 화면 컴포넌트 안에 API 요청 코드를 직접 작성하지 않고
 * 이 파일로 분리하면 나중에 수정하거나 재사용하기 쉬워진다.
 */

/*
 * 백엔드에서 사용하는 온보딩 종류
 *
 * 문자열을 화면마다 직접 입력하면 오타가 날 수 있으므로
 * 한곳에서 상수로 관리한다.
 */
export const ONBOARDING_TUTORIAL_KEY = Object.freeze({
  // Memory Jar 서비스 전체 이용 흐름 3장 소개
  WELCOME: "WELCOME",

  // 저금통 목록 화면의 새 저금통 만들기 안내
  JAR_LIST: "JAR_LIST",

  // 새 저금통 만들기 화면의 테마, 이름, 오픈일, 생성 안내
  JAR_CREATE: "JAR_CREATE",

  // 저금통 상세 화면의 쪽지, 초대, 채팅 안내
  JAR_DETAIL: "JAR_DETAIL",

  // 저금통 오픈 후 오늘의 추억 한 장 안내
  DAILY_DRAW: "DAILY_DRAW",
});

/*
 * 사용자가 온보딩을 어떻게 끝냈는지 나타내는 상태
 */
export const ONBOARDING_STATUS = Object.freeze({
  // 마지막 단계까지 보고 완료
  COMPLETED: "COMPLETED",

  // 건너뛰기 버튼을 눌러 종료
  SKIPPED: "SKIPPED",
});

/*
 * 온보딩 API의 공통 주소
 *
 * 조회:
 * GET /api/v1/me/onboarding
 *
 * 저장:
 * PUT /api/v1/me/onboarding/{tutorialKey}
 */
const ONBOARDING_API_PATH = "/api/v1/me/onboarding";

/*
 * 서버 공통 응답 구조에서 실제 데이터만 꺼내는 함수
 *
 * 서버 응답:
 * {
 *   data: {
 *     version: 1,
 *     items: [...]
 *   }
 * }
 *
 * 반환값:
 * {
 *   version: 1,
 *   items: [...]
 * }
 */
function extractData(response) {
  return response?.data?.data;
}

/*
 * 전달받은 온보딩 종류가 올바른 값인지 확인한다.
 *
 * 예:
 * WELCOME    → 정상
 * JAR_LIST   → 정상
 * UNKNOWN    → 프론트에서 바로 오류 발생
 *
 * 백엔드에서도 다시 검증하지만,
 * 프론트의 실수는 서버 요청 전에 발견하는 것이 좋다.
 */
function validateTutorialKey(tutorialKey) {
  const allowedTutorialKeys = Object.values(
    ONBOARDING_TUTORIAL_KEY
  );

  if (!allowedTutorialKeys.includes(tutorialKey)) {
    throw new Error(
      `지원하지 않는 온보딩 종류예요: ${tutorialKey}`
    );
  }
}

/*
 * 전달받은 온보딩 상태가 올바른 값인지 확인한다.
 */
function validateStatus(status) {
  const allowedStatuses = Object.values(
    ONBOARDING_STATUS
  );

  if (!allowedStatuses.includes(status)) {
    throw new Error(
      `지원하지 않는 온보딩 상태예요: ${status}`
    );
  }
}

/*
 * 현재 로그인 사용자의 전체 온보딩 상태를 조회한다.
 *
 * signal은 화면이 사라지거나 로그인 사용자가 바뀌었을 때
 * 진행 중인 요청을 취소하기 위해 사용한다.
 */
export async function getMyOnboardingProgress({
  signal,
} = {}) {
  const response = await apiClient.get(
    ONBOARDING_API_PATH,
    {
      signal,
    }
  );

  return extractData(response);
}

/*
 * 특정 온보딩의 완료 또는 건너뛰기 상태 저장
 *
 * PUT /api/v1/me/onboarding/{tutorialKey}
 *
 * 요청 예시:
 * {
 *   status: "COMPLETED"
 * }
 *
 * 사용 예시:
 *
 * finishOnboarding(
 *   ONBOARDING_TUTORIAL_KEY.WELCOME,
 *   ONBOARDING_STATUS.COMPLETED
 * );
 *
 * 또는:
 *
 * finishOnboarding(
 *   ONBOARDING_TUTORIAL_KEY.JAR_LIST,
 *   ONBOARDING_STATUS.SKIPPED
 * );
 */
export async function finishOnboarding(
  tutorialKey,
  status
) {
  // 잘못된 문자열이 서버로 전달되지 않도록 먼저 확인한다.
  validateTutorialKey(tutorialKey);
  validateStatus(status);

  /*
   * PUT 요청은 데이터를 변경하는 요청이므로
   * CSRF 토큰을 먼저 받아와야 한다.
   *
   * fetchCsrf()가 받은 토큰은 apiClient가 기억하고,
   * 이후 PUT 요청 헤더에 자동으로 추가한다.
   */
  await fetchCsrf();

  const response = await apiClient.put(
    `${ONBOARDING_API_PATH}/${tutorialKey}`,
    {
      status,
    }
  );

  return extractData(response);
}

/*
 * named export와 default export를 모두 제공한다.
 *
 * named export 예시:
 * import {
 *   getMyOnboardingProgress,
 *   finishOnboarding,
 * } from "../../api/onboardingApi";
 *
 * default export 예시:
 * import onboardingApi from "../../api/onboardingApi";
 */
const onboardingApi = {
  getMyOnboardingProgress,
  finishOnboarding,
};

export default onboardingApi;