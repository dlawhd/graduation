import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";

/** 펜·도형 선택을 PC 모달과 모바일 아래쪽 패널로 제공하고, 배경 단축키와 초점 이동을 막는다. */
export default function StudioPickerDialog({ title, description, onClose, children, footer, scrollKey }) {
  const ref = useRef(null), titleId = useId(), descriptionId = useId();
  const contentRef = useRef(null);
  // 페이지나 분류를 바꾸면 새 목록의 첫 줄부터 보여준다. 선택 창의 초점은 그대로 유지한다.
  useEffect(() => { if (contentRef.current) contentRef.current.scrollTop = 0; }, [scrollKey]);
  useEffect(() => {
    const dialog = ref.current, previousFocus = document.activeElement;
    if (!dialog.open) dialog.showModal();
    dialog.querySelector('[aria-pressed="true"]')?.focus();
    return () => { dialog.close(); if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus(); };
  }, []);
  return createPortal(<dialog ref={ref} aria-labelledby={titleId} aria-describedby={descriptionId} onCancel={onClose}
    onKeyDown={event => event.stopPropagation()} onClick={event => { if (event.target === event.currentTarget) onClose(); }}
    className="fixed inset-x-0 bottom-0 top-auto m-0 max-h-[85dvh] w-full max-w-none overflow-hidden rounded-t-3xl bg-white p-0 text-slate-800 shadow-2xl backdrop:bg-slate-950/40 sm:inset-0 sm:m-auto sm:max-h-[80dvh] sm:w-[min(92vw,560px)] sm:rounded-3xl">
    <div className="flex max-h-[85dvh] flex-col sm:max-h-[80dvh]">
      <div className="shrink-0 border-b border-slate-100 p-5"><div className="flex items-center justify-between gap-3"><h3 id={titleId} className="text-lg font-black">{title}</h3><button type="button" onClick={onClose} className="min-h-11 rounded-xl bg-slate-100 px-4 text-sm font-bold">닫기</button></div><p id={descriptionId} className="mt-2 text-xs leading-5 text-slate-600">{description}</p></div>
      <div ref={contentRef} className="min-h-0 overflow-y-auto overscroll-contain p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">{children}</div>
      {footer && <div className="shrink-0 border-t border-slate-100 bg-white px-5 pt-3 pb-[max(.75rem,env(safe-area-inset-bottom))]">{footer}</div>}
    </div>
  </dialog>, document.body);
}
