import { useState } from "react";
import StudioPickerDialog from "./StudioPickerDialog";
import ShapeSwatch from "./ShapeSwatch";
import { shapePage } from "../shapePaging.mjs";

/** 도형 버튼에서 바로 여는 선택 창이다. 이미지 그림판은 전체 목록으로 시작하고 분류별로 좁혀 볼 수 있다. */
export default function ShapeSelectionDialog({ basicShapes, characters = [], selectedShape, disabled, tone, onSelect, onClose }) {
  const [category, setCategory] = useState("ALL");
  const [page, setPage] = useState(1);
  const allShapes = [...basicShapes, ...characters];
  const entries = category === "BASIC" ? basicShapes : category === "CHARACTERS" ? characters : allShapes;
  const categories = [["ALL", "전체", allShapes.length], ["BASIC", "기본 도형", basicShapes.length], ["CHARACTERS", "캐릭터", characters.length]];
  const shown = shapePage(entries, page);
  const pagination = <nav aria-label="도형 페이지" className="flex items-center justify-center gap-4"><button type="button" disabled={disabled || shown.page === 1} onClick={() => setPage(shown.page - 1)} className="min-h-11 rounded-xl border border-slate-200 px-4 text-xs font-bold disabled:opacity-40">이전</button><span role="status" className="min-w-12 text-center text-sm font-bold tabular-nums">{shown.page} / {shown.totalPages}</span><button type="button" disabled={disabled || shown.page === shown.totalPages} onClick={() => setPage(shown.page + 1)} className="min-h-11 rounded-xl border border-slate-200 px-4 text-xs font-bold disabled:opacity-40">다음</button></nav>;
  return <StudioPickerDialog title="어떤 도형을 그릴까요?" description="선택해도 이미 그린 그림은 그대로예요. 그림판에서 드래그하면 원하는 위치와 크기로 넣을 수 있어요." onClose={onClose} footer={pagination} scrollKey={`${category}:${shown.page}`}>
    {characters.length > 0 && <div role="group" aria-label="도형 카테고리" className="mb-4 flex flex-wrap gap-2">{categories.map(([id, label, count]) => <button key={id} type="button" disabled={disabled} aria-pressed={category === id} onClick={() => { setCategory(id); setPage(1); }} className={"min-h-11 rounded-xl border px-4 text-xs font-bold " + (category === id ? "border-emerald-700 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-white text-slate-600")}>{label} · {count}</button>)}</div>}
    <p className="mb-3 text-xs text-slate-500" role="status">{entries.length}가지 모양 중에서 골라주세요.</p>
    <div role="group" aria-label="선택할 도형 목록" className="grid grid-cols-3 gap-2 sm:grid-cols-4">{shown.items.map(([id, label]) => <button key={id} type="button" disabled={disabled} aria-pressed={selectedShape === id} onClick={() => { if (!disabled) onSelect(id); }} className={"flex min-h-20 flex-col items-center justify-center gap-1 rounded-xl border bg-white px-1 py-2 text-xs font-bold focus-visible:outline-emerald-700 disabled:opacity-40 " + (selectedShape === id ? "border-emerald-600 ring-2 ring-emerald-200" : "border-slate-200 hover:bg-emerald-50")}><ShapeSwatch shape={id} tone={tone}/>{label}</button>)}</div>
  </StudioPickerDialog>;
}
