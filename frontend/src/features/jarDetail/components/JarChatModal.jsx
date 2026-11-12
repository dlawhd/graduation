import { useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import JarChatPanel from "../../../pages/JarChatPanel";

/*
 * JarChatModal 역할
 *
 * 저금통 채팅을 모달로 보여주는 컴포넌트야.
 *
 * 쉽게 말하면:
 * - 평소에는 채팅창을 숨긴다.
 * - "저금통 채팅" 버튼을 눌렀을 때만 채팅방을 크게 보여준다.
 * - 모달을 닫으면 JarChatPanel도 사라져서 polling도 같이 멈출 수 있다.
 */
export default function JarChatModal({
  open,
  jar,
  currentUserId,
  onClose,
}) {
  const dialogRef = useRef(null);
  const closeRef = useRef(null);

  useLayoutEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    const opener = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    // 기본 dialog의 키보드 초점 가두기와 배경 비활성화를 이용한다.
    dialog.showModal();
    closeRef.current?.focus();
    document.body.style.overflow = "hidden";
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, [open]);

  // open이 false면 모달을 아예 만들지 않는다.
  if (!open) return null;

  return createPortal(
    <dialog
      ref={dialogRef}
      aria-label={`${jar?.name || "저금통"} 채팅`}
      className="m-auto h-[min(800px,calc(100dvh-1rem))] max-h-none w-[calc(100%_-_1rem)] max-w-3xl overflow-hidden rounded-2xl bg-white p-0 shadow-2xl backdrop:bg-slate-900/55 sm:h-[min(800px,calc(100dvh-3rem))] sm:w-[calc(100%_-_3rem)] sm:rounded-3xl"
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      // 열기 버튼의 click이 끝날 때 창이 뜨므로 배경에서 시작한 누름만 닫기로 취급한다.
      onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <style>
        {`
          @keyframes jarChatPop {
            0% {
              opacity: 0;
              transform: translateY(18px) scale(0.9);
            }
            100% {
              opacity: 1;
              transform: translateY(0) scale(1);
            }
          }

          .jar-chat-pop {
            animation: jarChatPop 260ms cubic-bezier(0.22, 1, 0.36, 1);
          }
          @media (prefers-reduced-motion: reduce) { .jar-chat-pop { animation: none; } }
        `}
      </style>

      <div className="jar-chat-pop flex h-full flex-col overflow-hidden">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 sm:px-6">
          <div>
            <p className="text-lg font-black text-slate-800">
              {jar?.name || "저금통 채팅방"}
            </p>

            <p className="mt-1 text-sm text-slate-500">
              저금통 멤버들과 나누는 이야기
            </p>
          </div>

          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="min-h-11 shrink-0 rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-600 transition hover:bg-slate-50"
          >
            닫기
          </button>
        </div>

        <section className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <JarChatPanel
              jarId={jar?.jarId}
              currentUserId={currentUserId}
              embedded
            />
        </section>
      </div>
    </dialog>,
    document.body
  );
}
