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
  palette,
  currentUserId,
  onClose,
}) {
  // open이 false면 모달을 아예 만들지 않는다.
  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9992] flex items-start justify-center overflow-y-auto overscroll-contain bg-slate-900/55 px-4 py-4 sm:py-6"
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
        className="jar-chat-pop relative z-10 flex max-h-[calc(100dvh-2rem)] w-full max-w-4xl flex-col overflow-hidden rounded-[34px] border border-white/70 bg-white/95 p-6 shadow-[0_30px_90px_rgba(15,23,42,0.28)] backdrop-blur-sm sm:max-h-[calc(100dvh-3rem)]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <p className="text-lg font-black text-slate-800">
              저금통 채팅방
            </p>

            <p className="mt-1 text-sm text-slate-500">
              {jar?.name
                ? `${jar.name} 멤버들과 대화할 수 있어요.`
                : "저금통 멤버들과 대화할 수 있어요."}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-200 px-3 py-1 text-sm font-bold text-slate-500 transition hover:bg-slate-50"
          >
            닫기
          </button>
        </div>

        <section
          className={`min-h-0 flex-1 overflow-hidden rounded-[30px] border p-4 shadow-sm ${palette.panel}`}
        >
          <div className="min-h-0 flex-1 overflow-y-auto rounded-[24px] bg-white/70">
            <JarChatPanel
              jarId={jar?.jarId}
              currentUserId={currentUserId}
            />
          </div>
        </section>
      </div>
    </div>,
    document.body
  );
}