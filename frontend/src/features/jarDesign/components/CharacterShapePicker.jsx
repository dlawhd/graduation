import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CHARACTER_SHAPES, QUICK_CHARACTER_SHAPES } from "../characterShapes.mjs";
import ShapeSwatch from "./ShapeSwatch";

const shapeButtonClass = "flex min-h-20 flex-col items-center justify-center gap-1 rounded-xl border bg-white px-1 py-2 text-xs font-bold transition focus-visible:outline-violet-600 disabled:opacity-40";

/** 캐릭터 또는 기본 도형의 대표 목록과 전체 선택 창을 제공한다. 선택은 그림 자체를 수정하지 않는다. */
export default function CharacterShapePicker({ selectedShape, disabled, onSelect, tone = "violet", entries = CHARACTER_SHAPES, quickEntries = QUICK_CHARACTER_SHAPES, kind = "캐릭터" }) {
  const [open, setOpen] = useState(false);
  const selected = entries.find(([id]) => id === selectedShape);
  return <>
    <div className="mb-2 flex items-center justify-between gap-2">
      <span className="text-xs font-bold text-slate-700">{kind} 모양</span>
      <button type="button" disabled={disabled} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)} className="min-h-11 rounded-xl border border-violet-200 bg-white px-3 text-xs font-bold text-violet-700 disabled:opacity-40">전체 보기 · {entries.length}종</button>
    </div>
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="group" aria-label={`대표 ${kind} 모양`}>
      {quickEntries.map(([id, label]) => <button key={id} type="button" disabled={disabled} aria-pressed={selectedShape === id} onClick={() => onSelect(id)} className={shapeButtonClass + (selectedShape === id ? " border-violet-400 ring-2 ring-violet-300" : " border-slate-200 hover:bg-violet-50")}><ShapeSwatch shape={id} tone={tone}/>{label}</button>)}
    </div>
    <p className="mt-3 text-xs leading-5 text-slate-600" role="status">{selected ? <>선택한 모양: <strong className="text-violet-700">{selected[1]}</strong> · 그림판에서 드래그해 넣어요.</> : "모양을 고른 뒤 그림판에서 드래그해 넣어요."}</p>
    {open && <CharacterShapeDialog entries={entries} kind={kind} tone={tone} selectedShape={selectedShape} disabled={disabled} onSelect={id => { if (disabled) return; onSelect(id); setOpen(false); }} onClose={() => setOpen(false)}/>}
  </>;
}

/** PC에서는 가운데 선택 창, 모바일에서는 아래에서 펼쳐지는 패널로 전체 캐릭터를 보여준다. */
function CharacterShapeDialog({ selectedShape, disabled, onSelect, onClose, tone, entries, kind }) {
  const dialogRef = useRef(null);
  const titleId = useId(), descriptionId = useId();
  useEffect(() => {
    const dialog = dialogRef.current, previousFocus = document.activeElement;
    // 네이티브 모달로 배경 조작과 탭 이동을 막고, 닫을 때 원래 버튼으로 초점을 돌린다.
    if (!dialog.open) dialog.showModal();
    const selectedButton = dialog.querySelector('[aria-pressed="true"]');
    selectedButton?.focus();
    return () => { dialog.close(); if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus(); };
  }, []);
  return createPortal(<dialog ref={dialogRef} data-character-tone={tone} aria-labelledby={titleId} aria-describedby={descriptionId} onCancel={onClose}
    onClick={event => { if (event.target === event.currentTarget) onClose(); }}
    // 포털의 키 입력이 그림판에 전달되어 되돌리기·삭제 단축키를 실행하지 않도록 한다.
    onKeyDown={event => event.stopPropagation()}
    className="fixed inset-x-0 bottom-0 top-auto m-0 max-h-[85dvh] w-full max-w-none overflow-hidden rounded-t-3xl bg-white p-0 text-slate-800 shadow-2xl backdrop:bg-slate-950/40 sm:inset-0 sm:m-auto sm:max-h-[80dvh] sm:w-[min(92vw,560px)] sm:rounded-3xl">
    <div className="flex max-h-[85dvh] flex-col sm:max-h-[80dvh]">
      <div className="shrink-0 border-b border-slate-100 p-5">
        <div className="flex items-center justify-between gap-3"><h3 id={titleId} className="text-lg font-black">{kind === "캐릭터" ? "어떤 캐릭터를 그릴까요?" : "어떤 도형을 그릴까요?"}</h3><button type="button" onClick={onClose} className="min-h-11 rounded-xl bg-slate-100 px-4 text-sm font-bold">닫기</button></div>
        <p id={descriptionId} className="mt-2 text-xs leading-5 text-slate-600">선택해도 이미 그린 그림은 그대로예요. 그림판에서 드래그하면 원하는 위치와 크기로 넣을 수 있어요.</p>
      </div>
      <div className="min-h-0 overflow-y-auto overscroll-contain p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4" role="group" aria-label={`전체 ${kind} 모양`}>{entries.map(([id, label]) => <button key={id} type="button" disabled={disabled} aria-pressed={selectedShape === id} onClick={() => onSelect(id)} className={shapeButtonClass + (selectedShape === id ? " border-violet-400 ring-2 ring-violet-300" : " border-slate-200 hover:bg-violet-50")}><ShapeSwatch shape={id} tone={tone}/>{label}</button>)}</div>
      </div>
    </div>
  </dialog>, document.body);
}
