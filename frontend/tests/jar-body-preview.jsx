import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes, Link } from "react-router-dom";
import "../src/index.css";
import JarDesignNewPage from "../src/pages/JarDesignNewPage";
import JarCustomDesignVisual from "../src/features/jarDetail/components/JarCustomDesignVisual";
import { StompClientProvider } from "../src/realtime/StompClientProvider";
import apiClient from "../src/api/apiClient";
import { JAR_BODIES } from "../src/features/jarDesign/jarBodies.mjs";
import JarBodyStage from "../src/features/jarDesign/components/JarBodyStage";
import { samePhotoFrame, WHOLE_PHOTO, coverPhotoFrame, containPhotoFrame } from "../src/features/jarDesign/photoFraming.mjs";
import { SLOT_CATALOG } from "../src/features/jarDesign/slotCatalog.mjs";
import { SlotSwatch } from "../src/features/jarDesign/components/JarSlotOverlay";

// Vite의 기본 index.html 빌드에 포함되지 않는 로컬 UI 검증용 진입점이다.
// 모든 HTTP 요청은 이 메모리 어댑터에서 종료되며 WebSocket 연결을 시작하지 않는다.
if (!import.meta.env.DEV) throw new Error("로컬 개발 전용 화면입니다.");
const sample = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="480" height="480" viewBox="0 0 480 480"><rect width="480" height="480" fill="#fffaf3"/><path d="M242 380V203M242 315Q140 220 156 312Q182 350 242 343M242 286Q335 189 328 278Q298 321 242 317" fill="#85b59b" stroke="#477b5c" stroke-width="8"/><g fill="#ebafbf" stroke="#cc7b93" stroke-width="5"><ellipse cx="240" cy="153" rx="39" ry="67"/><ellipse cx="240" cy="153" rx="39" ry="67" transform="rotate(72 240 202)"/><ellipse cx="240" cy="153" rx="39" ry="67" transform="rotate(144 240 202)"/><ellipse cx="240" cy="153" rx="39" ry="67" transform="rotate(216 240 202)"/><ellipse cx="240" cy="153" rx="39" ry="67" transform="rotate(288 240 202)"/></g><circle cx="240" cy="202" r="35" fill="#edc76a"/></svg>');
let draft = { draftId: 999, status: "ACTIVE", bodyStyle: "CAT", selectedDesignType: null, photoFrame:null, originalContentFrame:{x:0,y:0,width:1,height:1}, generations: [{ generationId: 1, style: "WATERCOLOR", status: "SUCCEEDED" }], cutoutRegions: [] };
let finalForm = {};
const landscape = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="480" height="480"><defs><linearGradient id="s" x2="0" y2="1"><stop stop-color="#f6ac81"/><stop offset="1" stop-color="#f4d7aa"/></linearGradient></defs><rect width="480" height="480" fill="white"/><svg y="105" width="480" height="270" viewBox="0 0 800 450"><rect width="800" height="450" fill="url(#s)"/><circle cx="575" cy="107" r="64" fill="#ffe8a7"/><path d="M0 232L137 117L280 232L389 159L575 265L720 142L800 241V450H0" fill="#769d95"/><path d="M0 297Q120 234 245 298T500 298T800 303V450H0" fill="#397d82"/><path d="M0 353Q131 318 288 365T800 348V450H0" fill="#aad7cf"/><path d="M0 427Q123 374 211 450H0" fill="#e5c09b"/><g fill="#fff4e4"><rect x="325" y="268" width="122" height="73" rx="4"/><path d="M303 270L387 206L465 270" fill="#b75d52"/><rect x="372" y="301" width="24" height="40" fill="#496b60"/><rect x="337" y="286" width="25" height="21" fill="#b0d3c4"/><rect x="407" y="286" width="25" height="21" fill="#b0d3c4"/></g></svg></svg>');
let activeSample = sample, saveFailsOnce = false;
// 주소로 같은 검증 장면을 다시 열 수 있게 한다. 운영 진입점에는 포함되지 않는다.
const landscapeFixture = new URLSearchParams(window.location.search).get("fixture") === "landscape";
if (landscapeFixture) {
  activeSample = landscape;
  draft = { ...draft, selectedDesignType:"ORIGINAL", selectedGenerationId:null,
    originalContentFrame:{x:0,y:.21875,width:1,height:.5625} };
}
const requests = [];
apiClient.defaults.adapter = async (config) => {
  let data = {};
  const url = config.url, method = config.method;
  const input = typeof config.data === "string" ? JSON.parse(config.data) : config.data;
  requests.push({method,url});
  if (url.endsWith("/composition") && saveFailsOnce) { saveFailsOnce = false; throw new Error("로컬 저장 실패 검증: 편집은 보존돼요."); }
  if (url.endsWith("/csrf")) data = { token: "local-fixture", headerName: "X-XSRF-TOKEN" };
  else if (url === "/api/v1/design-drafts" && method === "post") { draft = { ...draft, bodyStyle: input.get("bodyStyle") }; data = { draftId: 999 }; }
  else if (url.endsWith("/preview")) data = { previewUrl: activeSample };
  else if (url.endsWith("/selection")) { draft = { ...draft, selectedDesignType: input.designType, selectedGenerationId: input.generationId, photoFrame:null, slotCenterX: null, slotCenterY: null, slotSizeRatio: null, cutoutRegions:[] }; }
  else if (url.endsWith("/composition")) {
    if (draft.bodyStyle !== input.bodyStyle || !samePhotoFrame(draft.photoFrame ?? null, input.photoFrame))
      draft = { ...draft, bodyStyle:input.bodyStyle, photoFrame:input.photoFrame, slotCenterX:null, slotCenterY:null, slotSizeRatio:null, slotStyle:"CAPSULE", cutoutRegions:[] };
  }
  else if (url.endsWith("/slot")) draft = { ...draft, slotCenterX: input.centerX, slotCenterY: input.centerY, slotSizeRatio: input.sizeRatio, slotStyle: input.slotStyle };
  else if (url.endsWith("/cutout")) draft = { ...draft, cutoutRegions: input.regions || [] };
  else if (url.endsWith("/generations")) draft = { ...draft, generations: [...draft.generations, { generationId: draft.generations.length + 1, style: input.style, status: "SUCCEEDED" }] };
  else if (url.endsWith("/finalize")) { finalForm = input; data = { jarId: 999 }; }
  else if (url === "/api/v1/design-drafts/999") data = { ...draft };
  else throw new Error(`검증하지 않은 요청 차단: ${method} ${url}`);
  return { data: { data }, status: 200, statusText: "OK", headers: {}, config };
};
function Result() { return <main className="mx-auto max-w-lg p-6"><h1 className="text-2xl font-bold">로컬 생성 완료 · {finalForm.name}</h1><JarCustomDesignVisual design={{ ...draft, imageUrl: activeSample }}/><p>저장한 본체: {draft.bodyStyle || "이미지 단독"}</p><p>저장한 입구: {draft.slotStyle || "CAPSULE"}</p><p data-saved-photo-frame>{JSON.stringify(draft.photoFrame)}</p><p>사진 배치 저장 요청: {requests.filter((r) => r.url.endsWith("/composition")).length}</p></main>; }
/** 실제 공용 렌더러의 입구 24종을 밝은/어두운 바탕과 작은 표시 크기에서 비교한다. */
function SlotSheet() {
  const [checks,setChecks]=useState([]);
  useEffect(()=>{
    // 실제 SVG 엔진으로 구멍의 도착 영역 9점을 검사한다. 겉보기 중앙이 빈 초승달 같은 오류를 잡는다.
    setChecks(SLOT_CATALOG.filter(entry=>entry.freeform).map(entry=>{
      const svg=document.querySelector(`svg[data-slot-artwork="${entry.id}"]`);
      const hole=svg.querySelector("[data-slot-opening]");
      const outer=svg.querySelector("clipPath path");
      const box=outer.getBBox();
      const aim=entry.target;
      const valid=[-1,0,1].every(dx=>[-1,0,1].every(dy=>{
        const x=(aim.x+dx*aim.width/2)*100,y=(aim.y+dy*aim.height/2)*100;
        return hole.isPointInFill(new DOMPoint((x-50)/.72+50,(y-50)/.72+50));
      }));
      return {id:entry.id,valid,bounds:box.x>=0 && box.y>=0 && box.x+box.width<=100 && box.y+box.height<=100};
    }));
  },[]);
  return <main className="mx-auto max-w-[1280px] px-5 py-8">
    <p className="text-xs font-bold tracking-[.25em] text-violet-700">MEMORY ATELIER · SMALL DETAILS</p>
    <h1 className="mt-3 text-3xl font-black text-slate-800">추억이 들어가는 24가지 작은 문</h1>
    <p className="mt-3 text-sm text-slate-500">클래식 8개 · 실루엣 자체가 다른 작은 문 16개. 위는 크게 · 아래는 실제 작은 크기.</p>
    <p data-slot-geometry-check className="mt-2 text-xs text-slate-500">도면·도착 영역 검사: {checks.length}종 / {checks.filter(check=>check.valid && check.bounds).length}종 통과{checks.filter(check=>!check.valid || !check.bounds).map(check=>` · ${JSON.stringify(check)}`).join("")}</p>
    <div className="mt-7 grid grid-cols-1 gap-4 sm:grid-cols-3 lg:grid-cols-4">{SLOT_CATALOG.map(entry=><article key={entry.id} className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
      <div className="flex h-32 items-center justify-center bg-gradient-to-br from-[#fcf8f2] to-[#ebe6f2]"><SlotSwatch value={entry.id} size={98}/></div>
      <div className="flex justify-center gap-6 bg-slate-800 py-4"><SlotSwatch value={entry.id} size={40}/><span className="rounded-lg bg-white"><SlotSwatch value={entry.id} size={40}/></span></div>
      <div className="p-4"><p className="text-[10px] font-bold text-violet-600">{entry.collection}</p><h2 className="mt-1 text-sm font-black text-slate-800">{entry.name}</h2><p className="mt-1 text-xs text-slate-500">{entry.description}</p></div>
    </article>)}</div>
  </main>;
}
/** 운영 호출 없이 모든 본체의 기본 장식과 실제 그림 합성을 같은 크기로 비교한다. */
function ContactSheet() {
  const [withImage, setWithImage] = useState(false);
  const [animalsOnly, setAnimalsOnly] = useState(false);
  const [wholeImage, setWholeImage] = useState(false);
  const bodies = animalsOnly ? JAR_BODIES.filter(body => body.newAnimal) : JAR_BODIES;
  const [geometryChecks, setGeometryChecks] = useState([]);
  useEffect(() => {
    // 진짜 SVG 엔진에서 창 안의 점을 샘플링한다. 범위 검사만으로는 사진 창이 실루엣을 벗어난 오류를 찾지 못한다.
    const checks = bodies.filter(body => body.newAnimal).map(body => {
      const node = document.querySelector(`[data-jar-body="${body.id}"]`);
      const shape = Array.from(node.querySelectorAll("path")).find(path => path.getAttribute("d") === body.path && path.getAttribute("fill")?.includes("-body)"));
      const w = body.window; let valid = Boolean(shape), samples = 0;
      for (let x=w.x+1; x<w.x+w.width; x+=5) for (let y=w.y+1; y<w.y+w.height; y+=5) {
        const cornerX = Math.max(w.x+w.radius-x,0,x-(w.x+w.width-w.radius));
        const cornerY = Math.max(w.y+w.radius-y,0,y-(w.y+w.height-w.radius));
        if (cornerX**2+cornerY**2 > w.radius**2) continue;
        samples++; valid = valid && shape.isPointInFill(new DOMPoint(x,y));
      }
      return { id:body.id, valid, samples };
    });
    setGeometryChecks(checks);
  }, [animalsOnly, withImage]);
  return <main className="mx-auto max-w-[1440px] px-4 py-8 sm:px-8">
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4"><div><p className="text-[10px] font-bold tracking-[.3em] text-emerald-800">THE MEMORY ATELIER</p><h1 className="mt-2 text-3xl font-black text-stone-800">마음이 머무는 {JAR_BODIES.length}가지 오브제</h1><p className="mt-3 text-sm text-stone-500">유리 공방부터 작은 숲까지. 서로 다른 색, 소재, 그리고 이야기.</p><button type="button" aria-pressed={animalsOnly} onClick={() => setAnimalsOnly(v=>!v)} className="mt-3 min-h-11 rounded-full bg-emerald-50 px-4 text-xs font-bold text-emerald-800">{animalsOnly ? "모든 오브제 보기" : "새 동물 20종만 보기"}</button></div>
      <div className="flex rounded-full border border-stone-200 bg-white p-1">{[[false,"오브제 감상"],[true,"같은 그림 합성"]].map(([mode,label]) => <button key={label} type="button" aria-pressed={withImage===mode} onClick={() => setWithImage(mode)} className={`min-h-11 rounded-full px-4 text-xs font-bold ${withImage===mode ? "bg-emerald-800 text-white" : "text-stone-600"}`}>{label}</button>)}</div>
    </div>
    {withImage && <button type="button" aria-pressed={wholeImage} onClick={() => setWholeImage(v=>!v)} className="mb-4 min-h-11 rounded-full bg-white px-4 text-xs font-bold text-emerald-800">{wholeImage ? "전체 보기 적용 중 · 꽉 채우기로 전환" : "꽉 채우기 적용 중 · 전체 보기로 전환"}</button>}
    <p data-animal-geometry-check className="mb-4 text-xs text-emerald-800">새 동물 사진 창 검사: {geometryChecks.filter(c=>c.valid).length}/{geometryChecks.length} · {geometryChecks.reduce((sum,c)=>sum+c.samples,0)}개 좌표{geometryChecks.some(c=>!c.valid) && ` · 오류: ${geometryChecks.filter(c=>!c.valid).map(c=>c.id).join(", ")}`}</p>
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">{bodies.map((body) => <article key={body.id} className="relative overflow-hidden rounded-2xl border border-stone-200 bg-[#fffdf9]">
      <span className="absolute left-3 top-3 z-10 text-[9px] font-bold tracking-[.18em] text-stone-600">OBJECT {String(JAR_BODIES.indexOf(body)+1).padStart(2,"0")}</span>
      {withImage ? <div style={{ background:body.stage.light }}><JarCustomDesignVisual design={{ bodyStyle: body.id, imageUrl: sample, photoFrame:wholeImage ? containPhotoFrame(body.window,WHOLE_PHOTO) : coverPhotoFrame(body.window,WHOLE_PHOTO), slotCenterX: body.slot.centerX, slotCenterY: body.slot.centerY, slotSizeRatio: body.slot.sizeRatio, slotStyle: "CAPSULE" }}/></div> : <JarBodyStage body={body}/>}
      <div className="border-t border-stone-200/50 px-4 py-3"><h2 className="text-sm font-black text-stone-800">{body.name}</h2><p className="mt-1 text-[10px] leading-5 text-stone-500">{body.detail}</p></div>
    </article>)}</div>
  </main>;
}
const previewRoot = import.meta.hot?.data.root || createRoot(document.getElementById("root"));
if (import.meta.hot) import.meta.hot.data.root = previewRoot;
function FixtureApp() {
  const [version,setVersion] = useState(0);
  function reset(source) {
    activeSample = source === "landscape" ? landscape : sample;
    draft = { ...draft, status:"ACTIVE", bodyStyle:"CAT", selectedDesignType:"ORIGINAL", selectedGenerationId:null,
      slotCenterX:null, slotCenterY:null, slotSizeRatio:null, photoFrame:null, cutoutRegions:[], cutoutPoints:[],
      originalContentFrame: source === "landscape" ? {x:0,y:.21875,width:1,height:.5625} : {x:0,y:0,width:1,height:1} };
    setVersion((v) => v+1);
  }
  return <><div className="flex flex-wrap gap-2 bg-amber-50 p-3 text-xs"><button onClick={() => reset("landscape")} className="min-h-11 rounded-xl bg-white px-3">가로 사진 배치 검증</button><button onClick={() => reset("square")} className="min-h-11 rounded-xl bg-white px-3">정사각 그림 배치 검증</button><button onClick={() => { saveFailsOnce=true; }} className="min-h-11 rounded-xl bg-white px-3">다음 저장 실패 검증</button></div>
  <MemoryRouter key={version} initialEntries={[version || landscapeFixture ? "/?draft=999" : "/"]}><StompClientProvider><header className="flex flex-wrap justify-between gap-3 bg-white px-6 py-4 text-sm font-bold text-emerald-800"><Link to="/">MEMORY JAR · 로컬 검증 (서버 요청 없음)</Link><nav className="flex flex-wrap gap-4"><Link to="/contact-sheet">{JAR_BODIES.length}종 한눈에</Link><Link to="/slot-sheet">입구 24종</Link><Link to="/?draft=999">후보·편집 검증</Link></nav></header><Routes><Route path="/jars/999" element={<Result/>}/><Route path="/contact-sheet" element={<ContactSheet/>}/><Route path="/slot-sheet" element={<SlotSheet/>}/><Route path="*" element={<JarDesignNewPage/>}/></Routes></StompClientProvider></MemoryRouter></>;
}
previewRoot.render(<FixtureApp/>);
