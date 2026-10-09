import { useRef, useState } from "react";
import { basicBodyOutline, customJarBody, MAX_BODY_POINTS, outlineError } from "../customJarBody.mjs";
import CustomJarBodyArtwork from "./CustomJarBodyArtwork";
import JarDesignCanvas from "./JarDesignCanvas";

/** 틀의 외곽선을 자유롭게 그리거나 점으로 편집한다. 사진 그림판과 분리하여 AI가 틀을 바꾸지 않게 한다. */
export default function JarBodyWorkshop({ value, onChange, onContinue, onOpenCatalog, onImageOnly, disabled=false, previewUrl="" }) {
  const [tool,setTool]=useState("DRAW");
  const [history,setHistory]=useState([]);
  const [advanced,setAdvanced]=useState(false), [working,setWorking]=useState(false);
  const locked=disabled || working;
  const gesture=useRef(null);
  const outline=value || {points:[],color:"#d7e9df"};
  const error=outlineError(outline), body=customJarBody(outline);
  function checkpoint() { setHistory(prev=>[...prev.slice(-19),outline]); }
  function point(event) {
    const rect=event.currentTarget.ownerSVGElement?.getBoundingClientRect() || event.currentTarget.getBoundingClientRect();
    const clamp=n=>Math.round(Math.max(.05,Math.min(.95,n))*100000)/100000;
    return {x:clamp((event.clientX-rect.left)/rect.width),y:clamp((event.clientY-rect.top)/rect.height)};
  }
  function start(event) {
    if (disabled || tool==="EDIT" || (event.pointerType==="mouse" && event.button!==0)) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    checkpoint();
    const p=point(event);
    if (tool==="POINTS") { if (outline.points.length<MAX_BODY_POINTS) onChange({...outline,points:[...outline.points,p]}); return; }
    gesture.current={id:event.pointerId,points:[p]};
    onChange({...outline,points:[p]});
  }
  function move(event) {
    const g=gesture.current;
    if (disabled || !g || event.pointerId!==g.id) return;
    const p=point(event);
    if (g.index!=null) { onChange({...outline,points:outline.points.map((old,i)=>i===g.index?p:old)}); return; }
    const last=g.points.at(-1);
    if (Math.hypot(p.x-last.x,p.y-last.y)<.015 || g.points.length>=MAX_BODY_POINTS) return;
    g.points.push(p);
    onChange({...outline,points:[...g.points]});
  }
  function finish() {
    const g=gesture.current;
    // 끝점이 시작점과 아주 가까우면 하나로 닫는다. 중복 점은 서버 검증에서 거절된다.
    if (g?.points?.length>3 && Math.hypot(g.points[0].x-g.points.at(-1).x,g.points[0].y-g.points.at(-1).y)<.025)
      onChange({...outline,points:g.points.slice(0,-1)});
    gesture.current=null;
  }
  function useBasic(kind) { checkpoint(); onChange(basicBodyOutline(kind,outline.color)); setTool("EDIT"); }
  const path=outline.points.length ? "M"+outline.points.map(p=>`${p.x*480} ${p.y*480}`).join("L")+(outline.points.length>2?"Z":"") : "";
  return <section aria-label="저금통 틀 공방" className="mt-7 rounded-[28px] border border-stone-200 bg-[#fffdf9] p-4 sm:p-7">
    <p className="text-[10px] font-bold tracking-[.22em] text-emerald-700">A SHAPE THAT IS YOURS</p>
    <h2 className="mt-2 break-keep text-2xl font-black text-stone-800">틀부터, 우리답게 만들어볼까요?</h2>
    <p className="mt-3 max-w-2xl text-sm leading-7 text-stone-500">그림판처럼 펜으로 그리고, 도형을 더하고, 지우개로 다듬어보세요. 칠한 모양이 사진을 담을 틀이 돼요. 기본 틀에서 시작해도 좋아요.</p>
    <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
      <div className="min-w-0">
        <fieldset disabled={locked} className="mb-4 rounded-2xl bg-stone-50 p-4"><legend className="px-2 text-sm font-bold text-stone-700">꾸밈없는 기본 틀에서 시작하기</legend><div className="flex flex-wrap gap-2">{[["ROUND","둥근 틀"],["JAR","병 모양 틀"],["SQUARE","네모 틀"]].map(([kind,label])=><button key={kind} type="button" onClick={()=>useBasic(kind)} className="min-h-11 rounded-xl border border-stone-200 bg-white px-4 text-sm font-bold text-stone-600">{label}</button>)}</div></fieldset>
        {/* 기존 사진 그림판을 재사용하되 픽셀 원본과 틀 좌표는 별도로 보관한다. 편집 전환 중에도 획을 유지한다. */}
        <div hidden={advanced}><JarDesignCanvas purpose="BODY" bodyValue={value} onBodyChange={onChange} onWorkingChange={setWorking} disabled={disabled || advanced} onConfirm={onContinue}/></div>
        <button type="button" disabled={locked} aria-expanded={advanced} aria-controls="body-outline-editor" onClick={()=>{gesture.current=null;if(!advanced)setTool("EDIT");setAdvanced(v=>!v);}} className="mt-4 min-h-11 rounded-xl border border-stone-200 bg-white px-4 text-xs font-bold text-stone-600">{advanced?"← 그림판으로 돌아가기":"외곽선을 점으로 세밀하게 다듬기"}</button>
        <div id="body-outline-editor" hidden={!advanced} className="mt-4">
        <div role="group" aria-label="틀 그리기 도구" className="mb-3 flex flex-wrap gap-2">{[["DRAW","자유롭게 그리기"],["POINTS","점을 찍어 만들기"],["EDIT","점 다듬기"]].map(([id,label])=><button type="button" key={id} disabled={disabled} aria-pressed={tool===id} onClick={()=>{gesture.current=null;setTool(id);}} className={`min-h-11 rounded-xl px-4 text-xs font-bold ${tool===id?"bg-emerald-800 text-white":"bg-stone-100 text-stone-600"}`}>{label}</button>)}</div>
        <svg viewBox="0 0 480 480" aria-label="저금통 외곽선 그리기" role="group" onPointerDown={start} onPointerMove={move} onPointerUp={finish} onPointerCancel={()=>{gesture.current=null;}} onLostPointerCapture={()=>{gesture.current=null;}}
          className="aspect-square w-full touch-none rounded-3xl border border-stone-200 bg-white select-none">
          <defs><pattern id="body-workshop-grid" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="12" cy="12" r="1" fill="#e5e7e3"/></pattern></defs>
          <rect width="480" height="480" fill="url(#body-workshop-grid)"/>
          <rect x="24" y="24" width="432" height="432" rx="20" fill="none" stroke="#cfddd3" strokeDasharray="5 7"/>
          {path && <path d={path} fill={outline.color} fillOpacity=".65" stroke="#547563" strokeWidth="3" strokeLinejoin="round"/>}
          {/* 첫 점도 바로 보여 아직 선이 없는 상태에서 입력이 된 것을 확인할 수 있다. */}
          {tool==="POINTS" && outline.points.map((p,i)=><circle key={i} cx={p.x*480} cy={p.y*480} r="4" fill="#387356" aria-hidden="true" pointerEvents="none"/>)}
          {!path && <text x="240" y="240" textAnchor="middle" fill="#7c8d81" fontSize="16" pointerEvents="none">여기에 나만의 틀을 그려주세요</text>}
          {tool==="EDIT" && outline.points.map((p,i)=><circle key={i} cx={p.x*480} cy={p.y*480} r="6" fill="white" stroke="#387356" strokeWidth="2" role="button" aria-label={`외곽선 점 ${i+1}`} tabIndex={disabled?-1:0}
            onPointerDown={e=>{if(disabled || (e.pointerType==="mouse" && e.button!==0))return;e.stopPropagation();checkpoint();e.currentTarget.setPointerCapture(e.pointerId);gesture.current={id:e.pointerId,index:i};}}
            onKeyDown={e=>{const d={ArrowLeft:[-.01,0],ArrowRight:[.01,0],ArrowUp:[0,-.01],ArrowDown:[0,.01]}[e.key];if(!d||disabled)return;e.preventDefault();checkpoint();onChange({...outline,points:outline.points.map((old,j)=>j===i?{x:Math.max(.05,Math.min(.95,old.x+d[0])),y:Math.max(.05,Math.min(.95,old.y+d[1]))}:old)});}}/>) }
        </svg>
        <div className="mt-3 flex flex-wrap items-center gap-3"><button type="button" disabled={disabled||!history.length} onClick={()=>{onChange(history.at(-1));setHistory(prev=>prev.slice(0,-1));}} className="min-h-11 rounded-xl border border-stone-200 px-4 text-xs font-bold disabled:opacity-40">한 단계 되돌리기</button><button type="button" disabled={disabled||!outline.points.length} onClick={()=>{checkpoint();onChange({...outline,points:[]});setTool("DRAW");}} className="min-h-11 rounded-xl border border-stone-200 px-4 text-xs font-bold">새로 그리기</button><label className="flex min-h-11 items-center gap-2 text-xs font-bold text-stone-600">틀 색상<input aria-label="틀 색상" type="color" value={outline.color} disabled={disabled} onChange={e=>onChange({...outline,color:e.target.value})} className="h-8 w-9 rounded"/></label></div>
        <p role="status" className={`mt-3 text-xs leading-6 ${body?"text-emerald-800":"text-stone-500"}`}>{body?"좋아요. 이 틀 안에 사진과 그림을 담을 수 있어요.":error}</p>
        </div>
      </div>
      <aside className="rounded-3xl border border-emerald-100 bg-[#edf3ec] p-5 lg:sticky lg:top-24"><p className="text-xs font-bold text-emerald-800">사진이 담길 틀 미리보기</p><div className="mt-3 aspect-square rounded-2xl bg-white/60">{body?<CustomJarBodyArtwork customBody={outline} imageUrl={previewUrl} outlineOnly alt="직접 만든 틀 미리보기"/>:<div className="flex h-full items-center justify-center px-5 text-center text-sm leading-7 text-stone-400">모양을 만들면<br/>여기에 함께 보여요.</div>}</div><p className="mt-3 text-xs leading-6 text-stone-500">{previewUrl?"틀 안에 담긴 사진을 미리 보여드려요. 다음 단계에서 사진 위치와 확대를 조절할 수 있어요.":"지금은 속이 빈 테두리만 보여요. 다음 단계에서 이 안에 사진이나 그림을 담을 수 있어요."}</p><p role="status" className="mt-2 text-xs leading-6 text-emerald-800">{working?"그리는 중이에요. 손을 떼면 미리보기에 반영돼요.":body?"좋아요. 이 틀로 다음 단계를 시작할 수 있어요.":"모양을 만들거나 기본 틀을 골라주세요."}</p><button type="button" disabled={locked||!body} onClick={onContinue} className="mt-4 min-h-12 w-full rounded-xl bg-emerald-800 px-4 text-sm font-black text-white disabled:opacity-40">이 틀에 그림 담기 →</button></aside>
    </div>
    <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-stone-200 pt-5"><p className="text-sm leading-6 text-stone-500">직접 만든 모양이 마음에 들지 않나요? 그림은 유지한 채 다른 방식으로 바꿀 수 있어요.</p><div className="flex flex-wrap gap-2"><button type="button" disabled={locked} onClick={onOpenCatalog} className="min-h-11 rounded-xl border border-stone-300 bg-white px-4 text-sm font-bold text-stone-700">준비된 저금통에서 고르기</button><button type="button" disabled={locked} onClick={onImageOnly} className="min-h-11 rounded-xl px-4 text-sm font-bold text-stone-500">이미지만 사용하기</button></div></div>
  </section>;
}
