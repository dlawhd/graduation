// src/features/onboarding/components/TutorialCompletionDialog.jsx

import {
  useEffect,
  useRef,
} from "react";
import {
  createPortal,
} from "react-dom";

/*
 * TutorialCompletionDialog 역할
 *
 * 온보딩 안내를 끝까지 확인한 뒤
 * 사용자가 직접 "확인"을 눌러야 닫히는 완료 안내창이다.
 *
 * 자동으로 몇 초 뒤 사라지지 않으며,
 * 바깥 영역이나 Escape 키로도 닫히지 않는다.
 */
export default function TutorialCompletionDialog({
  isOpen,
  title,
  children,
  confirmLabel = "확인",
  onConfirm,
}) {
  const confirmButtonRef =
    useRef(null);

  /*
   * 완료창이 열리면:
   *
   * 1. 뒤쪽 페이지 스크롤을 막는다.
   * 2. 확인 버튼으로 키보드 포커스를 이동한다.
   */
  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const previousOverflow =
      document.body.style.overflow;

    document.body.style.overflow =
      "hidden";

    const frameId =
      window.requestAnimationFrame(
        () => {
          confirmButtonRef
            .current
            ?.focus();
        }
      );

    return () => {
      window.cancelAnimationFrame(
        frameId
      );

      document.body.style.overflow =
        previousOverflow;
    };
  }, [isOpen]);

  if (
    typeof document === "undefined" ||
    !isOpen
  ) {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-[540] flex items-center justify-center bg-slate-950/55 px-4 py-6 backdrop-blur-sm">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="tutorial-completion-title"
        className="w-full max-w-lg rounded-[32px] border border-white/80 bg-white px-6 py-8 text-center shadow-[0_30px_100px_rgba(15,23,42,0.30)] md:px-9 md:py-10"
      >
        {/* 완료 체크 표시 */}
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-cyan-400 text-2xl font-black text-white shadow-[0_14px_35px_rgba(16,185,129,0.28)]">
          ✓
        </div>

        <p className="mt-5 text-xs font-black uppercase tracking-[0.18em] text-emerald-600">
          Memory Jar Guide
        </p>

        <h2
          id="tutorial-completion-title"
          className="mt-2 break-keep text-2xl font-black tracking-tight text-slate-900 md:text-3xl"
        >
          {title}
        </h2>

        <div className="mt-4 break-keep text-sm font-medium leading-7 text-slate-500 md:text-base">
          {children}
        </div>

        {/*
         * 사용자가 직접 확인을 눌러야만 닫힌다.
         *
         * 배경 클릭, Escape, 자동 타이머는 사용하지 않는다.
         */}
        <button
          ref={confirmButtonRef}
          type="button"
          onClick={onConfirm}
          className="mt-7 inline-flex min-w-[130px] items-center justify-center rounded-2xl bg-gradient-to-r from-emerald-500 to-cyan-500 px-6 py-3 text-sm font-black text-white shadow-[0_12px_28px_rgba(16,185,129,0.25)] transition hover:-translate-y-0.5 hover:from-emerald-600 hover:to-cyan-600"
        >
          {confirmLabel}
        </button>
      </section>
    </div>,
    document.body
  );
}