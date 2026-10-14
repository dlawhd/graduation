import { useRef, useState } from "react";
import { basicBodyOutline, customJarBody, MAX_BODY_POINTS, outlineError } from "../customJarBody.mjs";
import CustomJarBodyArtwork from "./CustomJarBodyArtwork";
import JarDesignCanvas from "./JarDesignCanvas";
import CustomJarBodyViewer from "./CustomJarBodyViewer";
import "../bodyWorkshop.css";

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
  function updatePoints(points) {
    // 점으로 바꾼 경계에는 이전 사진 마스크/픽셀 그림을 재사용하지 않는다.
    onChange({points, color: outline.color});
  }
  function undoOutline() {
    const restored=history.at(-1);
    onChange(restored);setHistory(prev=>prev.slice(0,-1));
    if(restored?.artworkUrl) setAdvanced(false);
  }
  function point(event) {
    const rect=event.currentTarget.ownerSVGElement?.getBoundingClientRect() || event.currentTarget.getBoundingClientRect();
    const clamp=n=>Math.round(Math.max(.05,Math.min(.95,n))*100000)/100000;
    return {x:clamp((event.clientX-rect.left)/rect.width),y:clamp((event.clientY-rect.top)/rect.height)};
  }
  function start(event) {
    if (disabled || tool==="EDIT" || (event.pointerType==="mouse" && event.button!==0)) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    // 점/외곽선을 끄는 동안 3D를 닫아 매 포인터 이동마다 GL context를 새로 만들지 않는다.
    setWorking(true);
    checkpoint();
    const p=point(event);
    if (tool==="POINTS") { if (outline.points.length<MAX_BODY_POINTS) updatePoints([...outline.points,p]); return; }
    gesture.current={id:event.pointerId,points:[p]};
    updatePoints([p]);
  }
  function move(event) {
    const g=gesture.current;
    if (disabled || !g || event.pointerId!==g.id) return;
    const p=point(event);
    if (g.index!=null) { updatePoints(outline.points.map((old,i)=>i===g.index?p:old)); return; }
    const last=g.points.at(-1);
    if (Math.hypot(p.x-last.x,p.y-last.y)<.015 || g.points.length>=MAX_BODY_POINTS) return;
    g.points.push(p);
    updatePoints([...g.points]);
  }
  function finish() {
    const g=gesture.current;
    // 끝점이 시작점과 아주 가까우면 하나로 닫는다. 중복 점은 서버 검증에서 거절된다.
    if (g?.points?.length>3 && Math.hypot(g.points[0].x-g.points.at(-1).x,g.points[0].y-g.points.at(-1).y)<.025)
      updatePoints(g.points.slice(0,-1));
    gesture.current=null;
    setWorking(false);
  }
  function useBasic(kind) { checkpoint(); onChange(basicBodyOutline(kind,outline.color)); setTool("EDIT"); }
  // 점 좌표만 바꾸면 기존 픽셀 그림과 어긋난다. 사용자가 동의한 경우에만 단색 점 편집으로 전환한다.
  function toggleAdvanced() {
    if (!advanced && outline.artworkUrl) {
      if (!window.confirm("점 편집으로 바꾸면 그린 테두리의 색과 질감 대신 단색 외곽선을 사용해요. 계속할까요? 한 단계 되돌리기로 복구할 수 있어요.")) return;
      checkpoint();
      onChange({points: outline.points, color: outline.color});
    }
    gesture.current = null;
    if (!advanced) setTool("EDIT");
    setAdvanced(v => !v);
  }
  const path=outline.points.length ? "M"+outline.points.map(p=>`${p.x*480} ${p.y*480}`).join("L")+(outline.points.length>2?"Z":"") : "";
  const basicTemplates = <div className="studio-basic-section" role="group" aria-label="꾸밈없는 기본 틀에서 시작하기"><h3 className="mb-3 text-sm font-black text-slate-800">기본 틀</h3><div className="grid grid-cols-3 gap-2">{[["ROUND","둥근 틀"],["JAR","병 모양 틀"],["SQUARE","네모 틀"]].map(([kind,label])=><button key={kind} type="button" disabled={locked} onClick={()=>useBasic(kind)} className="flex min-h-20 flex-col items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-1 text-xs font-bold text-slate-600">
    <svg viewBox="0 0 48 48" width="36" height="36" aria-hidden="true"><path d={"M"+basicBodyOutline(kind).points.map(p=>`${p.x*48} ${p.y*48}`).join("L")+"Z"} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/></svg>{label}
  </button>)}</div><p className="mt-2 text-[11px] leading-5 text-slate-500">기본 틀은 지금 모양을 바꿔요. 실행 취소로 되돌릴 수 있어요.</p></div>;
  return <section aria-label="저금통 틀 공방" className="body-workshop mt-6">
    <h2 className="sr-only">저금통 틀 만들기 작업 공간</h2>
    <div className="studio-workspace">
      <div className="min-w-0">
        {/* 기존 사진 그림판을 재사용하되 픽셀 원본과 틀 좌표는 별도로 보관한다. 편집 전환 중에도 획을 유지한다. */}
        <div hidden={advanced}><JarDesignCanvas purpose="BODY" workshopLayout toolboxHeader={basicTemplates} bodyValue={value} onBodyChange={onChange} onWorkingChange={setWorking} disabled={disabled || advanced} onConfirm={onContinue}/></div>
        <button type="button" disabled={locked} aria-expanded={advanced} aria-controls="body-outline-editor" onClick={toggleAdvanced} className="mt-4 min-h-11 rounded-xl border border-stone-200 bg-white px-4 text-xs font-bold text-stone-600">{advanced?"← 그림판으로 돌아가기":"외곽선을 점으로 세밀하게 다듬기"}</button>
        <div id="body-outline-editor" hidden={!advanced} className="mt-4">
        {basicTemplates}
        <div role="group" aria-label="틀 그리기 도구" className="mb-3 flex flex-wrap gap-2">{[["DRAW","자유롭게 그리기"],["POINTS","점을 찍어 만들기"],["EDIT","점 다듬기"]].map(([id,label])=><button type="button" key={id} disabled={disabled} aria-pressed={tool===id} onClick={()=>{gesture.current=null;setTool(id);}} className={`min-h-11 rounded-xl px-4 text-xs font-bold ${tool===id?"bg-emerald-800 text-white":"bg-stone-100 text-stone-600"}`}>{label}</button>)}</div>
        <svg viewBox="0 0 480 480" aria-label="저금통 외곽선 그리기" role="group" onPointerDown={start} onPointerMove={move} onPointerUp={finish} onPointerCancel={()=>{gesture.current=null;setWorking(false);}} onLostPointerCapture={()=>{gesture.current=null;setWorking(false);}} onKeyUp={()=>setWorking(false)} onBlur={()=>setWorking(false)}
          className="aspect-square w-full touch-none rounded-3xl border border-stone-200 bg-white select-none">
          <defs><pattern id="body-workshop-grid" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="12" cy="12" r="1" fill="#e5e7e3"/></pattern></defs>
          <rect width="480" height="480" fill="url(#body-workshop-grid)"/>
          <rect x="24" y="24" width="432" height="432" rx="20" fill="none" stroke="#cfddd3" strokeDasharray="5 7"/>
          {path && <path d={path} fill="none" stroke={outline.color} strokeWidth="8" strokeLinejoin="round"/>}
          {/* 첫 점도 바로 보여 아직 선이 없는 상태에서 입력이 된 것을 확인할 수 있다. */}
          {tool==="POINTS" && outline.points.map((p,i)=><circle key={i} cx={p.x*480} cy={p.y*480} r="4" fill="#387356" aria-hidden="true" pointerEvents="none"/>)}
          {!path && <text x="240" y="240" textAnchor="middle" fill="#7c8d81" fontSize="16" pointerEvents="none">여기에 나만의 틀을 그려주세요</text>}
          {tool==="EDIT" && outline.points.map((p,i)=><circle key={i} cx={p.x*480} cy={p.y*480} r="6" fill="white" stroke="#387356" strokeWidth="2" role="button" aria-label={`외곽선 점 ${i+1}`} tabIndex={disabled?-1:0}
            onPointerDown={e=>{if(disabled || (e.pointerType==="mouse" && e.button!==0))return;e.stopPropagation();checkpoint();e.currentTarget.setPointerCapture(e.pointerId);setWorking(true);gesture.current={id:e.pointerId,index:i};}}
            onKeyDown={e=>{const d={ArrowLeft:[-.01,0],ArrowRight:[.01,0],ArrowUp:[0,-.01],ArrowDown:[0,.01]}[e.key];if(!d||disabled)return;e.preventDefault();setWorking(true);checkpoint();updatePoints(outline.points.map((old,j)=>j===i?{x:Math.max(.05,Math.min(.95,old.x+d[0])),y:Math.max(.05,Math.min(.95,old.y+d[1]))}:old));}}/>) }
        </svg>
        <div className="mt-3 flex flex-wrap items-center gap-3"><button type="button" disabled={disabled||!history.length} onClick={undoOutline} className="min-h-11 rounded-xl border border-stone-200 px-4 text-xs font-bold disabled:opacity-40">한 단계 되돌리기</button><button type="button" disabled={disabled||!outline.points.length} onClick={()=>{checkpoint();updatePoints([]);setTool("DRAW");}} className="min-h-11 rounded-xl border border-stone-200 px-4 text-xs font-bold">새로 그리기</button><label className="flex min-h-11 items-center gap-2 text-xs font-bold text-stone-600">틀 색상<input aria-label="틀 색상" type="color" value={outline.color} disabled={disabled} onChange={e=>onChange({...outline,color:e.target.value})} className="h-8 w-9 rounded"/></label></div>
        <p role="status" className={`mt-3 text-xs leading-6 ${body?"text-emerald-800":"text-stone-500"}`}>{body?"좋아요. 이 틀 안에 사진과 그림을 담을 수 있어요.":error}</p>
        </div>
      </div>
      <aside className="studio-preview rounded-2xl border border-slate-200 bg-white p-5"><h3 className="text-base font-black text-slate-800"> 틀 미리보기</h3><div className="mt-4 aspect-square rounded-2xl bg-[#f3f7f5]">{body?<CustomJarBodyViewer customBody={outline} imageUrl={previewUrl} outlineOnly disabled={locked}><CustomJarBodyArtwork customBody={outline} imageUrl={previewUrl} outlineOnly alt="직접 만든 틀 미리보기"/></CustomJarBodyViewer>:<div className="flex h-full items-center justify-center px-5 text-center text-sm leading-7 text-stone-400">모양을 만들면<br/>여기에 함께 보여요.</div>}</div><p className="mt-4 rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs leading-6 text-slate-600">{previewUrl?"틀 안에 담긴 사진을 미리 보여드려요. 다음 단계에서 사진 위치와 확대를 조절할 수 있어요.":"사진과 그림은 다음 단계에서 담아요. 지금은 속이 빈 테두리를 만들어요."}</p><details className="mt-3 text-xs leading-6 text-slate-500"><summary className="cursor-pointer font-bold">3D 미리보기 안내</summary><p>틀에 두께를 붙여 돌려볼 수 있어요. 사진 속 인물을 입체로 만드는 기능은 아니에요.</p></details><p role="status" className="mt-4 rounded-xl bg-emerald-50 p-3 text-xs font-bold leading-6 text-emerald-800">{working?"그리는 중이에요. 손을 떼면 미리보기에 반영돼요.":body?"✓ 연결된 틀이에요. 다음 단계로 갈 수 있어요.":"모양을 만들거나 기본 틀을 골라주세요."}</p><button type="button" disabled={locked||!body} onClick={onContinue} className="mt-4 min-h-12 w-full rounded-xl bg-emerald-800 px-4 text-sm font-black text-white disabled:opacity-40">다음: 그림 담기 →</button><div className="mt-4 grid gap-2 border-t border-slate-100 pt-4"><button type="button" disabled={locked} onClick={onOpenCatalog} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600">준비된 저금통에서 고르기</button><button type="button" disabled={locked} onClick={onImageOnly} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600">이미지만 사용하기</button></div></aside>
    </div>
    <p className="mt-5 text-center text-xs leading-6 text-slate-500">내가 그린 색과 테두리는 그대로, 소중한 추억은 그 안에.</p>
  </section>;
}
