// src/features/onboarding/constants/dailyDrawTutorialSteps.js

/*
 * DAILY_DRAW_TUTORIAL_STEP 역할
 *
 * 저금통이 열린 뒤 사용할 수 있는
 * "오늘의 추억 한 장" 기능을 처음 사용자에게 설명한다.
 *
 * 이 튜토리얼은 한 단계만 사용한다.
 * 실제 "추억 쪽지 뽑기" 버튼을 스포트라이트로 강조해서
 * 사용자가 기능의 위치와 의미를 바로 이해할 수 있게 한다.
 */
export const DAILY_DRAW_TUTORIAL_STEP =
  Object.freeze({
    id: "OPEN_DAILY_DRAW",

    title: "오늘의 추억을 만나보세요",

    description:
      "저금통이 열린 뒤 담아둔 추억 중\n아직 만나보지 않은 한 장을 오늘의 추억으로 받아볼 수 있어요.",
  });