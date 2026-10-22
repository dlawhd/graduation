/** 기존 완료 알림의 상태·표시 시간을 유지하면서 화면 크기와 읽기 보조 기능을 통일한다. */
export default function FeedbackToast({ message, type = "success", onClose }) {
  if (!message) return null;
  return <div role={type === "error" ? "alert" : "status"} className="pointer-events-none fixed inset-x-4 top-4 z-[10050] mx-auto w-auto max-w-md">
    <div className={`pointer-events-auto flex items-start gap-3 rounded-2xl border bg-white px-4 py-3 shadow-xl ${type === "error" ? "border-rose-200 text-rose-800" : "border-emerald-200 text-emerald-900"}`}>
      <span aria-hidden="true" className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-bold ${type === "error" ? "bg-rose-50" : "bg-emerald-50"}`}>{type === "error" ? "!" : "✓"}</span>
      <p className="min-w-0 flex-1 break-words py-1 text-sm font-semibold leading-6">{message}</p>
      {onClose && <button type="button" aria-label="안내 닫기" onClick={onClose} className="min-h-11 min-w-11 shrink-0 rounded-lg text-sm hover:bg-slate-50">닫기</button>}
    </div>
  </div>;
}
