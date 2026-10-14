import { useId, useRef, useState } from "react";
import StudioPickerDialog from "./StudioPickerDialog";
import { hexToHsv, hsvToHex, isHexColor } from "../colorSelection.mjs";
import "../colorPicker.css";

/** 기본 선택기와 같은 색상 영역·무지개 막대를 크게 제공한다. 적용 전에는 기존 펜 색과 그림을 변경하지 않는다. */
export default function StudioColorDialog({ color, disabled, onSelect, onClose }) {
  const [hsv, setHsv] = useState(() => hexToHsv(color) || {h:0,s:0,v:0});
  const [code, setCode] = useState(color);
  const pointer = useRef(null), helpId = useId();
  const valid = isHexColor(code), preview = valid ? code : hsvToHex(hsv);
  function update(next) { setHsv(next); setCode(hsvToHex(next)); }
  function move(event) {
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const clamp = value => Math.max(0, Math.min(1, value));
    update({...hsv,s:clamp((event.clientX-rect.left)/rect.width),v:1-clamp((event.clientY-rect.top)/rect.height)});
  }
  function start(event) {
    if (disabled || !event.isPrimary || (event.pointerType === "mouse" && event.button !== 0)) return;
    event.preventDefault(); event.currentTarget.focus({preventScroll:true});
    pointer.current = event.pointerId; event.currentTarget.setPointerCapture(event.pointerId); move(event);
  }
  function end(event) {
    if (pointer.current !== event.pointerId) return;
    pointer.current = null;
    if(event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }
  function keyboard(event) {
    if (disabled || !["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(event.key)) return;
    event.preventDefault(); const step = event.shiftKey ? .1 : .01;
    update({...hsv,s:Math.max(0,Math.min(1,hsv.s+(event.key==="ArrowRight"?step:event.key==="ArrowLeft"?-step:0))),v:Math.max(0,Math.min(1,hsv.v+(event.key==="ArrowUp"?step:event.key==="ArrowDown"?-step:0)))});
  }
  return <StudioPickerDialog title="원하는 색을 크게 골라보세요" description="색상 영역을 누르거나 드래그해 고르세요. 적용해도 이미 그린 부분은 바뀌지 않아요." onClose={onClose}
    footer={<button type="button" disabled={disabled || !valid} onClick={() => { if (valid && !disabled) onSelect(code.toLowerCase()); }} className="min-h-12 w-full rounded-xl bg-emerald-700 px-4 text-sm font-bold text-white disabled:opacity-40">이 색 사용하기</button>}>
    <div role="group" aria-label="채도와 밝기 선택 영역" aria-describedby={helpId} tabIndex={disabled ? -1 : 0} onKeyDown={keyboard}
      onPointerDown={start} onPointerMove={event => { if (!disabled && pointer.current === event.pointerId) move(event); }} onPointerUp={end} onPointerCancel={end} onLostPointerCapture={() => {pointer.current=null;}}
      className="relative h-[clamp(160px,24dvh,240px)] w-full touch-none overflow-hidden rounded-2xl border border-slate-200 outline-offset-4 focus-visible:outline-2 focus-visible:outline-emerald-700"
      style={{backgroundColor:`hsl(${hsv.h} 100% 50%)`,backgroundImage:"linear-gradient(to top,#000,transparent),linear-gradient(to right,#fff,transparent)"}}>
      <span aria-hidden="true" className="pointer-events-none absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_#334155]" style={{left:`${hsv.s*100}%`,top:`${(1-hsv.v)*100}%`}}/>
    </div>
    <p id={helpId} className="mt-2 text-[11px] leading-5 text-slate-500">가로는 선명함, 세로는 밝기를 조절해요. 방향키로도 고를 수 있어요.</p>
    <label className="mt-4 block text-xs font-bold text-slate-600">색상<input aria-label="무지개 색상 조절" type="range" min="0" max="360" value={hsv.h} disabled={disabled} onChange={event => update({...hsv,h:Number(event.target.value)})} className="studio-hue mt-3 block h-5 w-full appearance-none rounded-full" style={{background:"linear-gradient(to right,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)"}}/></label>
    <div className="mt-5 flex items-center gap-3"><span aria-label={"선택한 색 " + preview} className="h-12 w-14 shrink-0 rounded-xl border border-slate-300" style={{background:preview}}/><label className="min-w-0 flex-1 text-xs font-bold text-slate-600">색상 코드<input aria-label="색상 코드" type="text" value={code} maxLength={7} spellCheck={false} disabled={disabled} onChange={event => {setCode(event.target.value); const next=hexToHsv(event.target.value);if(next)setHsv(next);}} className="mt-1 min-h-11 w-full rounded-xl border border-slate-200 px-3 font-mono text-sm"/></label></div>
    {!valid && <p role="status" className="mt-2 text-xs text-rose-600"># 뒤에 6자리 색상 코드를 입력해 주세요.</p>}
  </StudioPickerDialog>;
}
