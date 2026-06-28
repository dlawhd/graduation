import { createPortal } from "react-dom";

/*
 * JarMenuModal 역할
 *
 * 저금통 상세 페이지에서 버튼을 눌렀을 때
 * 정보를 화면 앞으로 띄워주는 공통 모달이야.
 *
 * 쉽게 말하면:
 * - 한 눈에 보는 저금통 정보
 * - 멤버 목록
 * - 초대 관리
 * 를 모두 같은 모양의 팝업으로 보여주는 재사용 상자야.
 */
export default function JarMenuModal({
  open,
  title,
  description,
  badge,
  palette,
  onClose,
  children,
  maxWidthClass = "max-w-4xl",
}) {
  // open이 false면 화면에 아무것도 만들지 않는다.
  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9995] flex items-start justify-center overflow-y-auto overscroll-contain bg-slate-900/55 px-4 py-4 sm:py-6"
      onMouseDown={onClose}
    >
      <style>
        {`
          .jar-menu-modal-scroll {
            scrollbar-width: thin;
            scrollbar-color: rgba(148, 163, 184, 0.45) transparent;
          }

          .jar-menu-modal-scroll::-webkit-scrollbar {
            width: 8px;
          }

          .jar-menu-modal-scroll::-webkit-scrollbar-track {
            background: transparent;
            margin: 16px 0;
          }

          .jar-menu-modal-scroll::-webkit-scrollbar-thumb {
            background: rgba(148, 163, 184, 0.45);
            border-radius: 999px;
            border: 2px solid rgba(255, 255, 255, 0.95);
          }
        `}
      </style>

      <div
        className={`relative z-10 flex max-h-[calc(100dvh-2rem)] w-full ${maxWidthClass} flex-col overflow-hidden rounded-[34px] border border-white/70 bg-white/95 shadow-[0_30px_90px_rgba(15,23,42,0.28)] backdrop-blur-sm sm:max-h-[calc(100dvh-3rem)]`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 border-b border-slate-100/80 bg-white/95 px-6 pb-4 pt-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <p className="text-lg font-black text-slate-800">
                  {title}
                </p>

                {badge && (
                  <span className={`rounded-full px-3 py-1 text-xs font-bold ${palette.countChip}`}>
                    {badge}
                  </span>
                )}
              </div>

              {description && (
                <p className="text-sm leading-6 text-slate-500">
                  {description}
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded-full border border-slate-200 px-3 py-1 text-sm font-bold text-slate-500 transition hover:bg-slate-50"
            >
              닫기
            </button>
          </div>
        </div>

        <div className="jar-menu-modal-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-6 pt-5">
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}