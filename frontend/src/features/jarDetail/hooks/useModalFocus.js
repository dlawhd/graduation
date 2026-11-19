import { useEffect, useRef } from "react";

/** 맨 위 창만 Tab·Escape를 처리하고, 닫히면 열었던 요소로 초점을 돌린다. */
export function useModalFocus(open, suspended, dialogRef, onClose) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open || suspended) return;
    const previous = document.activeElement;
    const controls = () => Array.from(dialogRef.current?.querySelectorAll(
      'button:not(:disabled), a[href], input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex="0"]'
    ) || []).filter(element => element.getClientRects().length > 0);
    (controls()[0] || dialogRef.current)?.focus();
    function keydown(event) {
      if (event.key === "Escape") {
        event.preventDefault(); event.stopImmediatePropagation(); closeRef.current?.();
      } else if (event.key === "Tab") {
        const items = controls(), first = items[0], last = items.at(-1);
        if (!items.includes(document.activeElement) || (event.shiftKey && document.activeElement === first)
            || (!event.shiftKey && document.activeElement === last)) {
          event.preventDefault(); (event.shiftKey ? last : first)?.focus();
        }
      }
    }
    window.addEventListener("keydown", keydown, true);
    return () => {
      window.removeEventListener("keydown", keydown, true);
      if (previous?.isConnected) previous.focus();
    };
  }, [open, suspended, dialogRef]);
}
