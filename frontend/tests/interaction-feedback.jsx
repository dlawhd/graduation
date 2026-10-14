import React from "react";
import { createRoot } from "react-dom/client";
import "../src/index.css";

/** 네트워크·계정 변경 없이 기본 hover와 기존 효과·선택·비활성 상태를 나란히 확인한다. */
function InteractionFeedbackFixture() {
  const base="min-h-16 rounded-xl border border-slate-200 px-5 py-3 text-sm font-bold";
  return <main className="min-h-screen bg-[#f3f8f5] p-8"><div className="mx-auto max-w-4xl"><h1 tabIndex={0} className="text-2xl font-black text-slate-800">버튼 피드백 확인</h1><p className="mt-3 text-sm text-slate-600">기존 스타일은 유지하고, 비어 있던 버튼에만 마우스 피드백을 보완합니다. 서버 요청은 없습니다.</p><div className="mt-7 grid gap-4 sm:grid-cols-3">
    <button type="button" className={base+" bg-white text-slate-700"}>기본 흰색 버튼</button>
    <button type="button" className={base+" bg-emerald-700 text-white"}>강조 버튼</button>
    <button type="button" aria-pressed="true" className={base+" bg-white text-emerald-800 ring-2 ring-emerald-500"}>선택된 버튼</button>
    <button type="button" className={base+" bg-white text-slate-700 hover:bg-violet-50"}>기존 hover 버튼</button>
    <button type="button" disabled style={{opacity:.4}} className={base+" bg-white text-slate-700"}>사용할 수 없는 버튼</button>
    <a role="button" aria-disabled="true" tabIndex={-1} className={base+" bg-white text-slate-400"}>비활성 링크</a>
    <a href="#feedback-note" className={base+" bg-white text-slate-700"}>버튼형 링크</a>
    <button type="button" data-hover-feedback="custom" className={base+" bg-white text-slate-700"}>기존 모션 제외 표시</button>
    <details className="rounded-xl border border-slate-200 bg-white p-4"><summary className="rounded-lg text-sm font-bold text-slate-700">펼침 버튼</summary><p id="feedback-note" className="mt-3 text-xs text-slate-500">펼침과 닫힘 동작은 유지합니다.</p></details>
  </div></div></main>;
}
const feedbackRoot=import.meta.hot?.data.root || createRoot(document.getElementById("root"));
if(import.meta.hot) import.meta.hot.data.root=feedbackRoot;
feedbackRoot.render(<InteractionFeedbackFixture/>);
