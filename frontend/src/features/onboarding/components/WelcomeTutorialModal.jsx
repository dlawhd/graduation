// src/features/onboarding/components/WelcomeTutorialModal.jsx

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  AnimatePresence,
  motion,
} from "framer-motion";
import {
  ONBOARDING_TUTORIAL_KEY,
} from "../../../api/onboardingApi";
import useOnboarding from "../hooks/useOnboarding";
import {
  WELCOME_TUTORIAL_STEPS,
} from "../constants/welcomeTutorialSteps";
import WelcomeTutorialVisual from "./WelcomeTutorialVisual";

/*
 * WelcomeTutorialModal 역할
 *
 * Memory Jar에 처음 들어온 사용자에게
 * 서비스 전체 이용 흐름을 3장으로 소개하는 모달이다.
 *
 * 주요 기능:
 *
 * 1. 다음과 이전 단계 이동
 * 2. 현재 진행 단계 점 표시
 * 3. 건너뛰기 상태를 백엔드에 저장
 * 4. 마지막 단계 완료 상태를 백엔드에 저장
 * 5. 저장 실패 시 모달을 닫지 않고 오류 표시
 * 6. 모달이 열려 있는 동안 배경 스크롤 차단
 */
export default function WelcomeTutorialModal() {
  const {
    activeTutorialKey,
    savingTutorialKey,
    error,
    completeActiveTutorial,
    skipActiveTutorial,
  } = useOnboarding();

  // 현재 보여주는 단계 번호
  const [
    currentStepIndex,
    setCurrentStepIndex,
  ] = useState(0);

  // 모달이 열렸을 때 포커스를 옮길 DOM
  const dialogRef = useRef(null);

  const isOpen =
    activeTutorialKey ===
    ONBOARDING_TUTORIAL_KEY.WELCOME;

  const isSaving =
    savingTutorialKey ===
    ONBOARDING_TUTORIAL_KEY.WELCOME;

  const currentStep =
    WELCOME_TUTORIAL_STEPS[
      currentStepIndex
    ];

  const isFirstStep =
    currentStepIndex === 0;

  const isLastStep =
    currentStepIndex ===
    WELCOME_TUTORIAL_STEPS.length - 1;

  /*
   * 이전 단계로 이동한다.
   *
   * 첫 번째 단계에서는 더 뒤로 갈 수 없으므로
   * 현재 단계 번호를 0보다 작게 만들지 않는다.
   */
  const handlePrevious = useCallback(() => {
    if (isSaving) {
      return;
    }

    setCurrentStepIndex(
      (previousIndex) =>
        Math.max(previousIndex - 1, 0)
    );
  }, [isSaving]);

  /*
   * 다음 단계로 이동한다.
   *
   * 마지막 단계에서는 이 함수 대신 완료 함수를 실행한다.
   */
  const handleNext = useCallback(() => {
    if (isSaving || isLastStep) {
      return;
    }

    setCurrentStepIndex(
      (previousIndex) =>
        Math.min(
          previousIndex + 1,
          WELCOME_TUTORIAL_STEPS.length - 1
        )
    );
  }, [isSaving, isLastStep]);

  /*
   * 건너뛰기를 백엔드에 저장한다.
   *
   * 저장에 실패하면 OnboardingProvider가 오류 상태를 보관하고
   * 모달은 그대로 열린 상태를 유지한다.
   */
  const handleSkip = useCallback(async () => {
    if (isSaving) {
      return;
    }

    try {
      await skipActiveTutorial();
    } catch {
      /*
       * 오류 문구는 Provider의 error 상태를 통해 화면에 표시한다.
       * 여기서 별도의 alert를 띄우지 않는다.
       */
    }
  }, [
    isSaving,
    skipActiveTutorial,
  ]);

  /*
   * 마지막 단계에서 WELCOME 완료를 백엔드에 저장한다.
   */
  const handleComplete =
    useCallback(async () => {
      if (isSaving) {
        return;
      }

      try {
        await completeActiveTutorial();
      } catch {
        /*
         * 저장 실패 시 Provider가 오류를 보관한다.
         * 완료 저장이 성공하기 전에는 모달을 닫지 않는다.
         */
      }
    }, [
      isSaving,
      completeActiveTutorial,
    ]);

  /*
   * 모달의 주 버튼 처리
   *
   * 중간 단계:
   * 다음 단계로 이동
   *
   * 마지막 단계:
   * 완료 상태를 서버에 저장
   */
  const handlePrimaryAction =
    useCallback(async () => {
      if (isLastStep) {
        await handleComplete();
        return;
      }

      handleNext();
    }, [
      isLastStep,
      handleComplete,
      handleNext,
    ]);

  /*
   * 모달이 새로 열릴 때마다 첫 번째 단계부터 보여준다.
   */
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setCurrentStepIndex(0);
  }, [isOpen]);

  /*
   * 모달이 열려 있는 동안 배경 화면 스크롤을 막고,
   * 키보드 포커스를 모달로 이동한다.
   */
  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const previousOverflow =
      document.body.style.overflow;

    document.body.style.overflow =
      "hidden";

    /*
     * DOM이 그려진 다음 포커스를 옮기기 위해
     * requestAnimationFrame을 사용한다.
     */
    const frameId =
      window.requestAnimationFrame(() => {
        dialogRef.current?.focus();
      });

    return () => {
      window.cancelAnimationFrame(frameId);
      document.body.style.overflow =
        previousOverflow;
    };
  }, [isOpen]);

  /*
   * 키보드로도 온보딩을 조작할 수 있게 한다.
   *
   * Escape:
   * 건너뛰기
   *
   * 오른쪽 화살표:
   * 다음
   *
   * 왼쪽 화살표:
   * 이전
   */
  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    function handleKeyDown(event) {
      if (isSaving) {
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        handleSkip();
        return;
      }

      if (
        event.key === "ArrowRight" &&
        !isLastStep
      ) {
        event.preventDefault();
        handleNext();
        return;
      }

      if (
        event.key === "ArrowLeft" &&
        !isFirstStep
      ) {
        event.preventDefault();
        handlePrevious();
      }
    }

    window.addEventListener(
      "keydown",
      handleKeyDown
    );

    return () => {
      window.removeEventListener(
        "keydown",
        handleKeyDown
      );
    };
  }, [
    isOpen,
    isSaving,
    isFirstStep,
    isLastStep,
    handleSkip,
    handleNext,
    handlePrevious,
  ]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-[400] flex items-center justify-center overflow-y-auto bg-slate-950/55 px-4 py-6 backdrop-blur-[5px]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{
            duration: 0.2,
          }}
        >
          {/*
           * 배경을 눌러도 모달이 닫히지 않게 했다.
           *
           * 실수로 배경을 눌렀을 때 DB에는 아무 상태도 저장되지 않고
           * 화면만 닫히는 문제를 막기 위한 처리다.
           */}
          <motion.section
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="welcome-tutorial-title"
            aria-describedby="welcome-tutorial-description"
            tabIndex={-1}
            className="relative w-full max-w-[620px] overflow-hidden rounded-[34px] border border-white/80 bg-white shadow-[0_32px_100px_rgba(15,23,42,0.35)] outline-none"
            initial={{
              opacity: 0,
              y: 28,
              scale: 0.96,
            }}
            animate={{
              opacity: 1,
              y: 0,
              scale: 1,
            }}
            exit={{
              opacity: 0,
              y: 18,
              scale: 0.97,
            }}
            transition={{
              duration: 0.28,
              ease: [0.22, 1, 0.36, 1],
            }}
          >
            {/* 모달 위쪽의 무지개빛 장식 선 */}
            <div className="h-2 bg-gradient-to-r from-cyan-300 via-violet-300 to-rose-300" />

            {/* 모달 뒤쪽 장식 */}
            <div className="pointer-events-none absolute -left-20 top-20 h-40 w-40 rounded-full bg-cyan-100/65 blur-3xl" />
            <div className="pointer-events-none absolute -right-20 top-48 h-44 w-44 rounded-full bg-rose-100/65 blur-3xl" />

            <div className="relative px-6 pb-6 pt-5 md:px-9 md:pb-8">
              {/* 상단 브랜드와 건너뛰기 */}
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-600">
                    Memory Jar Guide
                  </p>

                  <p className="mt-1 text-xs font-semibold text-slate-400">
                    처음 오셨나요? 천천히 알려드릴게요.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleSkip}
                  disabled={isSaving}
                  className="shrink-0 rounded-xl px-3 py-2 text-sm font-bold text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  건너뛰기
                </button>
              </div>

              {/* 단계가 바뀔 때 그림과 문구가 자연스럽게 전환된다. */}
              <AnimatePresence
                mode="wait"
                initial={false}
              >
                <motion.div
                  key={currentStep.id}
                  initial={{
                    opacity: 0,
                    x: 24,
                  }}
                  animate={{
                    opacity: 1,
                    x: 0,
                  }}
                  exit={{
                    opacity: 0,
                    x: -24,
                  }}
                  transition={{
                    duration: 0.22,
                  }}
                >
                  <WelcomeTutorialVisual
                    visualKey={
                      currentStep.visualKey
                    }
                  />

                  <div className="text-center">
                    <p className="text-xs font-black tracking-[0.16em] text-sky-500">
                      {currentStep.stepLabel}
                    </p>

                    <h2
                      id="welcome-tutorial-title"
                      className="mt-3 break-keep text-2xl font-black tracking-tight text-slate-900 md:text-[30px]"
                    >
                      {currentStep.title}
                    </h2>

                    <p
                      id="welcome-tutorial-description"
                      className="mx-auto mt-4 max-w-[500px] whitespace-pre-line break-keep text-sm font-medium leading-7 text-slate-500 md:text-[15px]"
                    >
                      {currentStep.description}
                    </p>
                  </div>
                </motion.div>
              </AnimatePresence>

              {/* 저장 중 발생한 오류 */}
              {error && (
                <div
                  role="alert"
                  className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-center text-sm font-semibold text-red-600"
                >
                  {error}
                </div>
              )}

              {/* 현재 진행 단계 표시 */}
              <div
                className="mt-7 flex justify-center gap-2"
                aria-label={`총 ${WELCOME_TUTORIAL_STEPS.length}단계 중 ${currentStepIndex + 1}단계`}
              >
                {WELCOME_TUTORIAL_STEPS.map(
                  (step, index) => {
                    const isCurrent =
                      index ===
                      currentStepIndex;

                    return (
                      <span
                        key={step.id}
                        aria-current={
                          isCurrent
                            ? "step"
                            : undefined
                        }
                        className={`h-2.5 rounded-full transition-all duration-200 ${
                          isCurrent
                            ? "w-8 bg-emerald-500"
                            : "w-2.5 bg-slate-200"
                        }`}
                      />
                    );
                  }
                )}
              </div>

              {/* 이전, 다음, 시작하기 버튼 */}
              <div className="mt-7 flex items-center justify-between gap-3">
                <div>
                  {!isFirstStep && (
                    <button
                      type="button"
                      onClick={
                        handlePrevious
                      }
                      disabled={isSaving}
                      className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-bold text-slate-600 shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      이전
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={
                    handlePrimaryAction
                  }
                  disabled={isSaving}
                  className="inline-flex min-w-[120px] items-center justify-center rounded-2xl bg-gradient-to-r from-emerald-500 to-cyan-500 px-5 py-3 text-sm font-black text-white shadow-[0_12px_28px_rgba(16,185,129,0.25)] transition hover:-translate-y-0.5 hover:from-emerald-600 hover:to-cyan-600 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSaving
                    ? "저장 중..."
                    : isLastStep
                      ? "Memory Jar 시작하기"
                      : "다음"}
                </button>
              </div>
            </div>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  );
}