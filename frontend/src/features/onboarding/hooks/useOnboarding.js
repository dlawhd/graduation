// src/features/onboarding/hooks/useOnboarding.js

import { useContext } from "react";
import {
  OnboardingContext,
} from "../OnboardingProvider";

/*
 * useOnboarding 역할
 *
 * OnboardingProvider가 관리하는 공통 상태와 함수를
 * 각 페이지나 컴포넌트에서 쉽게 꺼내 쓰게 해주는 Hook이다.
 *
 * 사용 예:
 *
 * const {
 *   shouldShowTutorial,
 *   openTutorial,
 * } = useOnboarding();
 */
export function useOnboarding() {
  const context =
    useContext(OnboardingContext);

  /*
   * Provider 밖에서 잘못 사용하면
   * 조용히 오류가 발생하는 대신 원인을 분명하게 알려준다.
   */
  if (!context) {
    throw new Error(
      "useOnboarding은 OnboardingProvider 안에서 사용해야 해요."
    );
  }

  return context;
}

export default useOnboarding;