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
  // open이 false면 모달을 아예 만들지 않는다.
  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9992] flex items-center justify-center overscroll-contain bg-slate-900/55 p-2 sm:p-6"
      onMouseDown={onClose}
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
        `}
      </style>

      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${jar?.name || "저금통"} 채팅`}
        className="jar-chat-pop relative z-10 flex h-[min(800px,calc(100dvh-1rem))] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl sm:h-[min(800px,calc(100dvh-3rem))] sm:rounded-3xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
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
    </div>,
    document.body
  );
}
