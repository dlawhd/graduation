// src/features/onboarding/components/TutorialSpotlight.jsx

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  motion,
} from "framer-motion";

/*
 * TutorialSpotlight 역할
 *
 * 안내할 버튼이나 영역 하나만 밝게 남겨두고,
 * 나머지 화면을 어둡게 가린 뒤 설명 카드를 보여준다.
 *
 * 쉽게 말하면:
 *
 * 1. targetRef가 가리키는 버튼 위치를 찾는다.
 * 2. 버튼 주변을 제외한 화면만 어둡게 가린다.
 * 3. 버튼 가까이에 설명 카드를 배치한다.
 * 4. 화면 크기나 스크롤 위치가 바뀌면 위치를 다시 계산한다.
 *
 * JAR_LIST뿐 아니라 이후 JAR_DETAIL 안내에서도
 * 같은 컴포넌트를 재사용할 수 있다.
 */

// 강조 영역과 실제 버튼 사이에 둘 여백
const SPOTLIGHT_PADDING = 10;

// 설명 카드와 강조 영역 사이의 간격
const TOOLTIP_GAP = 16;

// 화면 가장자리와 설명 카드 사이의 최소 여백
const VIEWPORT_MARGIN = 16;

// 데스크톱에서 사용할 설명 카드의 최대 너비
const MAX_TOOLTIP_WIDTH = 360;

/*
 * 설명 카드를 강조 영역 옆에 배치할 때
 * 글이 너무 좁아지지 않도록 보장할 최소 너비
 */
const MIN_SIDE_TOOLTIP_WIDTH = 280;

/*
 * 설명 카드의 세로 위치를 계산할 때 사용하는 예상 높이
 *
 * 실제 카드는 내용에 따라 조금 달라질 수 있지만,
 * 화면 밖으로 벗어나지 않게 배치하기 위한 기준값이다.
 */
const TOOLTIP_ESTIMATED_HEIGHT = 230;

/*
 * 숫자가 최소값보다 작거나 최대값보다 커지지 않게 제한한다.
 */
function clamp(value, min, max) {
  return Math.min(
    Math.max(value, min),
    max
  );
}

/*
 * preferredPlacement 값
 *
 * auto:
 * 기존처럼 아래 공간을 보고 위 또는 아래에 배치
 *
 * left:
 * 가능하면 강조 영역 왼쪽에 배치
 *
 * right:
 * 가능하면 강조 영역 오른쪽에 배치
 *
 * 옆 공간이 부족하면 자동으로 위 또는 아래에 배치한다.
 */
function createSpotlightLayout(
  targetElement,
  preferredPlacement = "auto",
) {
  if (!targetElement) {
    return null;
  }

  const targetRect =
    targetElement.getBoundingClientRect();

  const viewportWidth =
    window.innerWidth;

  const viewportHeight =
    window.innerHeight;

  /*
   * 강조 영역이 화면 밖으로 나가지 않도록
   * 현재 화면 안쪽으로 좌표를 제한한다.
   */
  const left = clamp(
    targetRect.left - SPOTLIGHT_PADDING,
    VIEWPORT_MARGIN / 2,
    viewportWidth - VIEWPORT_MARGIN / 2
  );

  const top = clamp(
    targetRect.top - SPOTLIGHT_PADDING,
    VIEWPORT_MARGIN / 2,
    viewportHeight - VIEWPORT_MARGIN / 2
  );

  const right = clamp(
    targetRect.right + SPOTLIGHT_PADDING,
    VIEWPORT_MARGIN / 2,
    viewportWidth - VIEWPORT_MARGIN / 2
  );

  const bottom = clamp(
    targetRect.bottom + SPOTLIGHT_PADDING,
    VIEWPORT_MARGIN / 2,
    viewportHeight - VIEWPORT_MARGIN / 2
  );

  const hole = {
    left,
    top,
    right,
    bottom,
    width: Math.max(
      right - left,
      0
    ),
    height: Math.max(
      bottom - top,
      0
    ),
  };

  /*
   * 위·아래 배치에서 사용할 기본 카드 너비
   */
  const tooltipWidth = Math.min(
    MAX_TOOLTIP_WIDTH,
    viewportWidth -
      VIEWPORT_MARGIN * 2
  );

  /*
   * 강조 영역을 기준으로 가운데 정렬한
   * 위·아래 설명 카드의 왼쪽 좌표
   */
  const tooltipLeft = clamp(
    hole.left +
      hole.width / 2 -
      tooltipWidth / 2,
    VIEWPORT_MARGIN,
    viewportWidth -
      tooltipWidth -
      VIEWPORT_MARGIN
  );

  /*
   * 강조 영역 왼쪽과 오른쪽에
   * 설명 카드를 놓을 수 있는 실제 공간
   */
  const availableLeftSpace =
    hole.left -
    VIEWPORT_MARGIN -
    TOOLTIP_GAP;

  const availableRightSpace =
    viewportWidth -
    hole.right -
    VIEWPORT_MARGIN -
    TOOLTIP_GAP;

  /*
   * 옆 배치에 사용할 카드 너비
   *
   * 최대 360px을 사용하되,
   * 현재 남아 있는 옆 공간보다 커지지 않게 한다.
   */
  const leftTooltipWidth =
    Math.min(
      MAX_TOOLTIP_WIDTH,
      availableLeftSpace
    );

  const rightTooltipWidth =
    Math.min(
      MAX_TOOLTIP_WIDTH,
      availableRightSpace
    );

  /*
   * 옆에 배치할 때 설명 카드가
   * 강조 영역 세로 가운데 근처에 오도록 한다.
   */
  const sideTooltipTop = clamp(
    hole.top +
      hole.height / 2 -
      TOOLTIP_ESTIMATED_HEIGHT / 2,
    VIEWPORT_MARGIN,
    Math.max(
      VIEWPORT_MARGIN,
      viewportHeight -
        TOOLTIP_ESTIMATED_HEIGHT -
        VIEWPORT_MARGIN
    )
  );

  /*
   * 미리보기처럼 오른쪽에 있는 큰 영역은
   * 왼쪽 공간이 충분하면 설명 카드를 왼쪽에 배치한다.
   */
  if (
    preferredPlacement === "left" &&
    leftTooltipWidth >=
      MIN_SIDE_TOOLTIP_WIDTH
  ) {
    return {
      hole,

      tooltip: {
        left:
          hole.left -
          TOOLTIP_GAP -
          leftTooltipWidth,

        top: sideTooltipTop,
        width: leftTooltipWidth,
      },

      placement: "left",
    };
  }

  /*
   * 강조 대상 왼쪽에 있고 오른쪽 공간이 충분한 경우
   * 설명 카드를 오른쪽에 배치할 수도 있다.
   */
  if (
    preferredPlacement === "right" &&
    rightTooltipWidth >=
      MIN_SIDE_TOOLTIP_WIDTH
  ) {
    return {
      hole,

      tooltip: {
        left:
          hole.right +
          TOOLTIP_GAP,

        top: sideTooltipTop,
        width: rightTooltipWidth,
      },

      placement: "right",
    };
  }

  /*
   * 옆 공간이 부족한 모바일 화면에서는
   * 기존처럼 아래 공간을 확인해 위 또는 아래로 배치한다.
   */
  const showBelow =
    viewportHeight -
      hole.bottom >=
    TOOLTIP_ESTIMATED_HEIGHT;

  return {
    hole,

    tooltip: showBelow
      ? {
          left: tooltipLeft,
          top:
            hole.bottom +
            TOOLTIP_GAP,
          width: tooltipWidth,
        }
      : {
          left: tooltipLeft,
          bottom:
            viewportHeight -
            hole.top +
            TOOLTIP_GAP,
          width: tooltipWidth,
        },

    placement: showBelow
      ? "below"
      : "above",
  };
}

export default function TutorialSpotlight({
  isOpen,
  targetRef,

  /*
   * 설명 카드의 선호 위치
   *
   * auto:
   * 화면 공간에 따라 위 또는 아래
   *
   * left:
   * 가능하면 강조 영역 왼쪽
   *
   * right:
   * 가능하면 강조 영역 오른쪽
   */
  preferredPlacement = "auto",

  eyebrow = "Memory Jar Guide",
  title,
  description,

  /*
   * 이전, 완료, 건너뛰기 버튼 문구
   */
  previousLabel = "이전",
  completeLabel = "알겠어요",
  skipLabel = "건너뛰기",

  /*
   * 첫 단계에서는 이전 버튼을 숨긴다.
   */
  showPrevious = false,

  isSaving = false,
  error = "",

  /*
   * 부모 화면에서 전달하는 버튼 처리 함수
   */
  onPrevious,
  onComplete,
  onSkip,
}) {
  // 현재 계산된 강조 영역과 설명 카드 위치
  const [
    layout,
    setLayout,
  ] = useState(null);

  // 모달이 열렸을 때 키보드 포커스를 받을 설명 카드
  const dialogRef = useRef(null);

  /*
   * 버튼의 현재 위치를 다시 읽어서
   * 화면 배치를 갱신한다.
   */
  const updateLayout =
    useCallback(() => {
      if (!isOpen) {
        setLayout(null);
        return;
      }

      setLayout(
        createSpotlightLayout(
          targetRef?.current,
          preferredPlacement
        )
      );
    }, [
      isOpen,
      targetRef,
      preferredPlacement,
    ]);

  /*
   * 안내가 열리거나 강조 대상이 바뀌면
   * 대상 버튼이 화면 중앙 근처에 오도록 이동한 뒤
   * 정확한 위치를 다시 계산한다.
   *
   * JAR_DETAIL처럼 단계마다 서로 다른 위치의 버튼을 강조할 때
   * 화면 밖에 있는 버튼을 잘못 강조하는 문제를 막는다.
   */
  useLayoutEffect(() => {
    if (!isOpen) {
      setLayout(null);
      return undefined;
    }

    const targetElement =
      targetRef?.current;

    if (!targetElement) {
      setLayout(null);
      return undefined;
    }

    /*
     * 현재 강조할 버튼이 화면 밖에 있을 수 있으므로
     * 먼저 화면 중앙 근처로 이동한다.
     */
    targetElement.scrollIntoView({
      behavior: "auto",
      block: "center",
      inline: "nearest",
    });

    // 스크롤 직후 현재 위치를 계산한다.
    updateLayout();

    /*
     * 브라우저가 스크롤 결과를 화면에 반영한 다음
     * 한 번 더 계산해서 좌표를 정확하게 맞춘다.
     */
    const frameId =
      window.requestAnimationFrame(
        updateLayout
      );

    return () => {
      window.cancelAnimationFrame(
        frameId
      );
    };
  }, [
    isOpen,
    targetRef,
    updateLayout,
  ]);

  /*
   * 창 크기 변경, 스크롤, 버튼 크기 변경이 발생하면
   * 강조 영역을 다시 계산한다.
   */
  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const targetElement =
      targetRef?.current;

    window.addEventListener(
      "resize",
      updateLayout
    );

    /*
     * true를 전달하면 페이지 내부 스크롤 영역에서 발생한
     * 스크롤도 함께 감지할 수 있다.
     */
    window.addEventListener(
      "scroll",
      updateLayout,
      true
    );

    const resizeObserver =
      typeof ResizeObserver ===
      "undefined"
        ? null
        : new ResizeObserver(
            updateLayout
          );

    if (
      targetElement &&
      resizeObserver
    ) {
      resizeObserver.observe(
        targetElement
      );
    }

    return () => {
      window.removeEventListener(
        "resize",
        updateLayout
      );

      window.removeEventListener(
        "scroll",
        updateLayout,
        true
      );

      resizeObserver?.disconnect();
    };
  }, [
    isOpen,
    targetRef,
    updateLayout,
  ]);

  const hasLayout =
    Boolean(layout);

  /*
   * 안내가 열려 있는 동안 배경 스크롤을 막고
   * 설명 카드로 키보드 포커스를 이동한다.
   */
  useEffect(() => {
    if (
      !isOpen ||
      !hasLayout
    ) {
      return undefined;
    }

    const previousOverflow =
      document.body.style.overflow;

    document.body.style.overflow =
      "hidden";

    const frameId =
      window.requestAnimationFrame(
        () => {
          dialogRef.current?.focus();
        }
      );

    return () => {
      window.cancelAnimationFrame(
        frameId
      );

      document.body.style.overflow =
        previousOverflow;
    };
  }, [
    isOpen,
    hasLayout,
  ]);

  /*
   * Escape 키로도 건너뛰기를 실행할 수 있게 한다.
   */
  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    function handleKeyDown(event) {
      if (
        event.key !== "Escape" ||
        isSaving
      ) {
        return;
      }

      event.preventDefault();
      onSkip?.();
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
    onSkip,
  ]);

  /*
   * 브라우저가 아닌 환경에서는 document.body를
   * 사용할 수 없으므로 아무것도 그리지 않는다.
   *
   * 또한 안내가 닫혔거나 위치 계산값이 없다면
   * Portal과 차단 레이어를 즉시 제거한다.
   *
   * 이 처리가 없으면 화면에서는 투명해졌지만
   * fixed 레이어가 클릭을 계속 가로막을 수 있다.
   */
  if (
    typeof document === "undefined" ||
    !isOpen ||
    !layout
  ) {
    return null;
  }

  return createPortal(
    <>
      {/* 위쪽 어두운 영역 */}
      <motion.div
            aria-hidden="true"
            className="fixed left-0 right-0 top-0 z-[410] bg-slate-950/65 backdrop-blur-[2px]"
            style={{
              height:
                layout.hole.top,
            }}
            initial={{
              opacity: 0,
            }}
            animate={{
              opacity: 1,
            }}
            exit={{
              opacity: 0,
            }}
          />

          {/* 왼쪽 어두운 영역 */}
          <motion.div
            aria-hidden="true"
            className="fixed left-0 z-[410] bg-slate-950/65 backdrop-blur-[2px]"
            style={{
              top:
                layout.hole.top,
              width:
                layout.hole.left,
              height:
                layout.hole.height,
            }}
            initial={{
              opacity: 0,
            }}
            animate={{
              opacity: 1,
            }}
            exit={{
              opacity: 0,
            }}
          />

          {/* 오른쪽 어두운 영역 */}
          <motion.div
            aria-hidden="true"
            className="fixed right-0 z-[410] bg-slate-950/65 backdrop-blur-[2px]"
            style={{
              top:
                layout.hole.top,
              left:
                layout.hole.right,
              height:
                layout.hole.height,
            }}
            initial={{
              opacity: 0,
            }}
            animate={{
              opacity: 1,
            }}
            exit={{
              opacity: 0,
            }}
          />

          {/* 아래쪽 어두운 영역 */}
          <motion.div
            aria-hidden="true"
            className="fixed bottom-0 left-0 right-0 z-[410] bg-slate-950/65 backdrop-blur-[2px]"
            style={{
              top:
                layout.hole.bottom,
            }}
            initial={{
              opacity: 0,
            }}
            animate={{
              opacity: 1,
            }}
            exit={{
              opacity: 0,
            }}
          />

          {/* 강조 대상 주변의 빛나는 테두리 */}
          <motion.div
            aria-hidden="true"
            className="pointer-events-none fixed z-[420] rounded-[24px] border-2 border-white shadow-[0_0_0_5px_rgba(52,211,153,0.55),0_0_42px_rgba(45,212,191,0.75)]"
            style={{
              left:
                layout.hole.left,
              top:
                layout.hole.top,
              width:
                layout.hole.width,
              height:
                layout.hole.height,
            }}
            initial={{
              opacity: 0,
              scale: 0.96,
            }}
            animate={{
              opacity: 1,
              scale: [
                1,
                1.025,
                1,
              ],
            }}
            exit={{
              opacity: 0,
              scale: 0.96,
            }}
            transition={{
              opacity: {
                duration: 0.2,
              },

              scale: {
                duration: 1.8,
                repeat: Infinity,
                ease: "easeInOut",
              },
            }}
          />

          {/*
           * 현재 화살표 모양은 위·아래 배치용이므로
           * 설명 카드가 왼쪽이나 오른쪽에 있을 때는 숨긴다.
           */}
          {(
            layout.placement === "below" ||
            layout.placement === "above"
          ) && (
            <motion.div
              aria-hidden="true"
              className={`pointer-events-none fixed z-[430] h-0 w-0 border-x-[10px] border-x-transparent ${
                layout.placement === "below"
                  ? "border-b-[12px] border-b-white"
                  : "border-t-[12px] border-t-white"
              }`}
              style={{
                left:
                  layout.hole.left +
                  layout.hole.width / 2 -
                  10,

                ...(layout.placement === "below"
                  ? {
                      top:
                        layout.hole.bottom +
                        TOOLTIP_GAP -
                        11,
                    }
                  : {
                      bottom:
                        window.innerHeight -
                        layout.hole.top +
                        TOOLTIP_GAP -
                        11,
                    }),
              }}
              initial={{
                opacity: 0,
              }}
              animate={{
                opacity: 1,
              }}
            />
          )}

          {/* 실제 안내 문구와 완료·건너뛰기 버튼 */}
          <motion.section
            ref={dialogRef}
            role="dialog"
            aria-labelledby="tutorial-spotlight-title"
            aria-describedby="tutorial-spotlight-description"
            tabIndex={-1}
            className="fixed z-[430] max-h-[calc(100vh-2rem)] overflow-y-auto rounded-[26px] border border-white/80 bg-white p-5 shadow-[0_24px_80px_rgba(15,23,42,0.35)] outline-none md:p-6"
            style={
              layout.tooltip
            }
            initial={{
              opacity: 0,

              /*
               * 왼쪽에 나타나는 카드는 오른쪽에서,
               * 오른쪽에 나타나는 카드는 왼쪽에서 들어온다.
               */
              x:
                layout.placement === "left"
                  ? 16
                  : layout.placement === "right"
                    ? -16
                    : 0,

              y:
                layout.placement === "below"
                  ? 16
                  : layout.placement === "above"
                    ? -16
                    : 0,

              scale: 0.96,
            }}
            animate={{
              opacity: 1,
              x: 0,
              y: 0,
              scale: 1,
            }}
            exit={{
              opacity: 0,

              y:
                layout.placement ===
                "below"
                  ? 10
                  : -10,

              scale: 0.97,
            }}
            transition={{
              duration: 0.24,
              ease: [
                0.22,
                1,
                0.36,
                1,
              ],
            }}
          >
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-emerald-600">
              {eyebrow}
            </p>

            <h2
              id="tutorial-spotlight-title"
              className="mt-2 break-keep text-xl font-black tracking-tight text-slate-900"
            >
              {title}
            </h2>

            <p
              id="tutorial-spotlight-description"
              className="mt-3 whitespace-pre-line break-keep text-sm font-medium leading-6 text-slate-500"
            >
              {description}
            </p>

            {/* DB 저장 중 오류가 생기면 안내를 닫지 않고 표시한다. */}
            {error && (
              <div
                role="alert"
                className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600"
              >
                {error}
              </div>
            )}

            {/*
             * 튜토리얼 이동 버튼
             *
             * 왼쪽:
             * 건너뛰기
             *
             * 오른쪽:
             * 이전, 다음 또는 안내 완료
             *
             * 첫 단계에서는 showPrevious가 false이므로
             * 이전 버튼이 나타나지 않는다.
             */}
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={onSkip}
                disabled={isSaving}
                className="rounded-xl px-4 py-2.5 text-sm font-bold text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {skipLabel}
              </button>

              <div className="ml-auto flex items-center gap-2">
                {showPrevious && (
                  <button
                    type="button"
                    onClick={onPrevious}
                    disabled={isSaving}
                    className="inline-flex min-w-[84px] items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-600 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {previousLabel}
                  </button>
                )}

                <button
                  type="button"
                  onClick={onComplete}
                  disabled={isSaving}
                  className="inline-flex min-w-[100px] items-center justify-center rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 px-4 py-2.5 text-sm font-black text-white shadow-[0_10px_24px_rgba(16,185,129,0.25)] transition hover:-translate-y-0.5 hover:from-emerald-600 hover:to-cyan-600 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSaving
                    ? "저장 중..."
                    : completeLabel}
                </button>
              </div>
            </div>
          </motion.section>
  </>,
  document.body
);
}