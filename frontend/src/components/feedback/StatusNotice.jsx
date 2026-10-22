/** 로딩·빈 목록·오류를 같은 형태로 보여주되, 의미와 다시 시도 행동은 구분한다. */
export default function StatusNotice({ type = "empty", title, children, onRetry, actionLabel = "다시 시도", busy = false }) {
  const error = type === "error";
  return <div role={error ? "alert" : "status"} aria-busy={type === "loading" || busy}
    className={`rounded-2xl border p-5 text-sm leading-6 ${error ? "border-rose-200 bg-rose-50 text-rose-800" : "border-slate-200 bg-slate-50 text-slate-600"}`}>
    <div className="flex items-start gap-3">
      <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white font-bold">{error ? "!" : type === "loading" ? "…" : "◇"}</span>
      <div className="min-w-0 flex-1 break-words">{title && <p className="font-bold">{title}</p>}{children && <div>{children}</div>}</div>
    </div>
    {onRetry && <button type="button" disabled={busy} onClick={onRetry} className="mt-3 min-h-11 rounded-xl border border-current px-4 font-bold disabled:opacity-50">{busy ? "확인 중…" : actionLabel}</button>}
  </div>;
}
