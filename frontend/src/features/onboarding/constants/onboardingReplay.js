// src/features/onboarding/constants/onboardingReplay.js

/*
 * ONBOARDING_REPLAY_STATE_KEY 역할
 *
 * 내정보에서 다른 페이지의 이용 방법을 선택했을 때,
 * React Router의 navigation state에 담아 전달할 이름이다.
 *
 * 예:
 *
 * /jars 화면
 * → 새 저금통 만들기 안내 선택
 * → /jars/new로 이동
 * → JarsNewPage가 이 값을 확인
 * → JAR_CREATE 안내를 강제로 다시 열기
 *
 * sessionStorage나 localStorage에는 저장하지 않으며, 한 번 실행한 뒤 navigation state에서 바로 제거한다.
 */
export const ONBOARDING_REPLAY_STATE_KEY =
  "onboardingReplayTutorialKey";