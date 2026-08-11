// src/features/onboarding/components/OnboardingHelpDialog.jsx

import {
  useEffect,
  useMemo,
} from "react";
import {
  createPortal,
} from "react-dom";
import {
  useLocation,
  useNavigate,
} from "react-router-dom";
import {
  ONBOARDING_TUTORIAL_KEY,
} from "../../../api/onboardingApi";
import useOnboarding from "../hooks/useOnboarding";
import {
  ONBOARDING_REPLAY_STATE_KEY,
} from "../constants/onboardingReplay";

/*
 * ONBOARDING_HELP_OPTIONS 역할
 *
 * 내정보의 "Memory Jar 이용 방법"에서
 * 사용자가 다시 선택할 수 있는 안내 목록이다.
 *
 * 영어 코드는 서버 및 프론트 내부 구분값이고,
 * 실제 화면에는 모두 한국어 문구를 표시한다.
 */
const ONBOARDING_HELP_OPTIONS =
  Object.freeze([
    {
      tutorialKey:
        ONBOARDING_TUTORIAL_KEY.WELCOME,

      title:
        "Memory Jar 전체 소개",

      description:
        "저금통을 만들고 추억을 담은 뒤 다시 만나는 전체 흐름을 확인해요.",

      stepLabel:
        "전체 흐름",
    },
    {
      tutorialKey:
        ONBOARDING_TUTORIAL_KEY.JAR_LIST,

      title:
        "저금통 목록 화면 안내",

      description:
        "내 저금통 목록과 새 저금통 만들기 버튼의 위치를 확인해요.",

      stepLabel:
        "목록 화면",
    },
    {
      tutorialKey:
        ONBOARDING_TUTORIAL_KEY.JAR_CREATE,

      title:
        "새 저금통 만들기 안내",

      description:
        "저금통 선택, 미리보기, 이름, 설명, 테마, 인원과 날짜 설정을 확인해요.",

      stepLabel:
        "생성 화면",
    },
    {
      tutorialKey:
        ONBOARDING_TUTORIAL_KEY.JAR_DETAIL,

      title:
        "저금통 상세 화면 안내",

      description:
        "새 쪽지 쓰기, 초대 관리, 저금통 채팅 기능을 다시 확인해요.",

      stepLabel:
        "상세 화면",
    },
  ]);

/*
 * OnboardingHelpDialog 역할
 *
 * 내정보의 "Memory Jar 이용 방법" 버튼을 눌렀을 때
 * 어떤 안내를 다시 볼지 선택하게 해주는 공통 창이다.
 *
 * 주요 기능:
 *
 * 1. 화면 문구는 모두 한국어로 표시한다.
 * 2. 선택한 안내가 있는 실제 페이지로 이동한다.
 * 3. force 옵션으로 완료·건너뛰기 여부와 관계없이 다시 연다.
 * 4. 기존 DB 완료 기록은 삭제하지 않는다.
 */
export default function OnboardingHelpDialog({
  isOpen,
  jars = [],
  onClose,
}) {
  const location =
    useLocation();

  const navigate =
    useNavigate();

  const {
    openTutorial,
  } = useOnboarding();

  /*
   * 현재 주소가 실제 저금통 상세 주소인지 확인한다.
   *
   * 일치:
   * /jars/76
   *
   * 불일치:
   * /jars
   * /jars/new
   */
  const currentJarId =
    useMemo(() => {
      const matched =
        location.pathname.match(
          /^\/jars\/(\d+)$/
        );

      return matched?.[1] ?? null;
    }, [location.pathname]);

  /*
   * 상세 화면 안내를 다시 볼 때 사용할 저금통 번호
   *
   * 1. 현재 상세 화면에 있다면 현재 저금통
   * 2. 다른 화면이라면 내 저금통 미리보기의 첫 번째 저금통
   */
  const detailTutorialJarId =
    currentJarId ??
    jars.find(
      (jar) => jar?.jarId
    )?.jarId ??
    null;

  /*
   * 선택창이 열려 있는 동안
   * 뒤쪽 페이지가 스크롤되지 않게 한다.
   */
  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const previousOverflow =
      document.body.style.overflow;

    document.body.style.overflow =
      "hidden";

    return () => {
      document.body.style.overflow =
        previousOverflow;
    };
  }, [isOpen]);

  /*
   * Escape 키로 이용 방법 선택창만 닫는다.
   *
   * JAR_DETAIL 완료 안내창과 달리
   * 이 창은 단순 선택창이므로 Escape 닫기를 허용한다.
   */
  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    function handleKeyDown(event) {
      if (event.key !== "Escape") {
        return;
      }

      event.preventDefault();
      onClose?.();
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
    onClose,
  ]);

  /*
   * 안내 종류별로 이동할 페이지를 결정한다.
   */
  function getTutorialTargetPath(
    tutorialKey
  ) {
    if (
      tutorialKey ===
      ONBOARDING_TUTORIAL_KEY.WELCOME
    ) {
      return "/jars";
    }

    if (
      tutorialKey ===
      ONBOARDING_TUTORIAL_KEY.JAR_LIST
    ) {
      return "/jars";
    }

    if (
      tutorialKey ===
      ONBOARDING_TUTORIAL_KEY.JAR_CREATE
    ) {
      return "/jars/new";
    }

    if (
      tutorialKey ===
      ONBOARDING_TUTORIAL_KEY.JAR_DETAIL
    ) {
      return detailTutorialJarId
        ? `/jars/${detailTutorialJarId}`
        : null;
    }

    return null;
  }

  /*
   * 사용자가 다시 볼 안내를 선택했을 때 실행한다.
   *
   * 같은 페이지의 안내:
   * → 바로 force로 연다.
   *
   * 다른 페이지의 안내:
   * → 먼저 목적지로 이동한다.
   * → navigation state에 다시 볼 안내 종류를 전달한다.
   * → 목적지 페이지가 준비된 뒤 직접 안내를 연다.
   */
  function handleSelectTutorial(
    tutorialKey
  ) {
    const targetPath =
      getTutorialTargetPath(
        tutorialKey
      );

    /*
     * 저금통 상세 안내인데 참여 중인 저금통이 없다면
     * 이동할 상세 주소가 없으므로 실행하지 않는다.
     */
    if (!targetPath) {
      return;
    }

    /*
     * 이용 방법 선택창을 먼저 닫는다.
     */
    onClose?.();

    /*
     * 이미 안내 대상 페이지에 있는 경우에는
     * 페이지 이동이 필요 없으므로 즉시 다시 연다.
     *
     * force: true는 기존 COMPLETED 또는 SKIPPED 상태와 관계없이
     * 사용자가 직접 요청한 이번 한 번만 다시 보여준다는 뜻이다.
     */
    if (
      location.pathname ===
      targetPath
    ) {
      openTutorial(
        tutorialKey,
        {
          force: true,
        }
      );

      return;
    }

    /*
     * 다른 페이지에 있는 경우에는
     * 튜토리얼을 지금 열지 않고 목적지로 먼저 이동한다.
     *
     * 목적지 페이지는 navigation state에 담긴 tutorialKey를 확인하고
     * 자신의 버튼과 입력 영역이 모두 준비된 뒤 안내를 연다.
     */
    navigate(
      targetPath,
      {
        state: {
          [ONBOARDING_REPLAY_STATE_KEY]:
            tutorialKey,
        },
      }
    );
  }

  if (
    typeof document === "undefined" ||
    !isOpen
  ) {
    return null;
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[520] flex items-center justify-center bg-slate-950/55 px-4 py-6 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(event) => {
        /*
         * 바깥 배경을 직접 눌렀을 때만 닫는다.
         * 선택창 내부 클릭은 닫지 않는다.
         */
        if (
          event.target ===
          event.currentTarget
        ) {
          onClose?.();
        }
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-help-title"
        className="max-h-[calc(100vh-3rem)] w-full max-w-2xl overflow-y-auto rounded-[32px] border border-white/80 bg-white p-6 shadow-[0_30px_100px_rgba(15,23,42,0.28)] md:p-8"
      >
        {/* 상단 제목과 닫기 버튼 */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-600">
              Memory Jar Guide
            </p>

            <h2
              id="onboarding-help-title"
              className="mt-2 text-2xl font-black tracking-tight text-slate-900 md:text-3xl"
            >
              어떤 이용 방법을 다시 볼까요?
            </h2>

            <p className="mt-3 break-keep text-sm font-medium leading-6 text-slate-500">
              이미 완료하거나 건너뛴 안내도
              원하는 시점에 다시 확인할 수 있어요.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="이용 방법 선택창 닫기"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-xl font-bold text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
          >
            ×
          </button>
        </div>

        {/* 다시 볼 수 있는 안내 목록 */}
        <div className="mt-7 grid gap-3">
          {ONBOARDING_HELP_OPTIONS.map(
            (option, index) => {
              const isJarDetailOption =
                option.tutorialKey ===
                ONBOARDING_TUTORIAL_KEY.JAR_DETAIL;

              const disabled =
                isJarDetailOption &&
                !detailTutorialJarId;

              return (
                <button
                  key={
                    option.tutorialKey
                  }
                  type="button"
                  disabled={disabled}
                  onClick={() =>
                    handleSelectTutorial(
                      option.tutorialKey
                    )
                  }
                  className="group flex w-full items-center gap-4 rounded-[22px] border border-slate-200 bg-slate-50/70 px-4 py-4 text-left transition hover:-translate-y-0.5 hover:border-emerald-200 hover:bg-emerald-50/70 disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:translate-y-0 disabled:hover:border-slate-200 disabled:hover:bg-slate-50/70 md:px-5"
                >
                  {/* 안내 순서 번호 */}
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-sm font-black text-emerald-600 shadow-sm ring-1 ring-slate-100 transition group-hover:ring-emerald-100">
                    {index + 1}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="block text-base font-black text-slate-900">
                      {option.title}
                    </span>

                    <span className="mt-1 block break-keep text-xs font-medium leading-5 text-slate-500 md:text-sm">
                      {disabled
                        ? "참여 중인 저금통이 생기면 상세 화면 안내를 다시 볼 수 있어요."
                        : option.description}
                    </span>
                  </span>

                  <span
                    aria-hidden="true"
                    className="shrink-0 text-lg font-black text-slate-300 transition group-hover:translate-x-1 group-hover:text-emerald-500"
                  >
                    →
                  </span>
                </button>
              );
            }
          )}
        </div>

        
        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-bold text-slate-600 transition hover:bg-slate-50"
          >
            닫기
          </button>
        </div>
      </section>
    </div>,
    document.body
  );
}