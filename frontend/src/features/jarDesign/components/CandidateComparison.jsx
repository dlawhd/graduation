import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { designImageRendering } from "../imageRendering.mjs";

/** 원본과 후보를 같은 크기로 비교하는 키보드 접근 가능한 확대창이다. */
export default function CandidateComparison({ originalUrl, candidateUrl, title, style, onClose, onSelect, disabled }) {
  const ref = useRef(null);
  useEffect(() => { ref.current.showModal(); }, []);
  return createPortal(<dialog ref={ref} onCancel={onClose} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }} aria-labelledby="candidate-compare-title" className="fixed inset-0 m-auto max-h-[92dvh] w-[min(94vw,960px)] overflow-auto rounded-3xl bg-white p-5 text-slate-800 shadow-2xl backdrop:bg-slate-950/50 sm:p-8">
    <div className="flex items-center justify-between gap-3"><h3 id="candidate-compare-title" className="text-xl font-black">원본과 나란히 비교해요</h3><button type="button" onClick={onClose} className="rounded-xl bg-slate-100 px-4 py-3 text-sm font-bold">닫기</button></div>
    <div className="mt-5 grid gap-4 sm:grid-cols-2">{[["내 원본", originalUrl, undefined], [title, candidateUrl, designImageRendering(style)]].map(([label, url, imageRendering]) => <div key={label}><p className="mb-2 text-sm font-bold">{label}</p><img src={url} alt={label + " 확대"} className="aspect-square w-full rounded-2xl border border-slate-200 object-contain" style={{ imageRendering }} /></div>)}</div>
    <button type="button" onClick={onSelect} disabled={disabled} className="mt-5 w-full rounded-xl bg-violet-600 px-5 py-3 font-black text-white disabled:opacity-40">이 디자인으로 계속하기 →</button>
  </dialog>, document.body);
}
