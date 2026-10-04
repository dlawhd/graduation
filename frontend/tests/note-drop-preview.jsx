import React, { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "../src/index.css";
import JarVisual from "../src/features/jarDetail/components/JarVisual";
import NoteSection from "../src/pages/NoteSection";
import FlyingNote from "../src/features/note/components/FlyingNote";
import { createNoteFlight, measureJarDropTarget } from "../src/features/jarDetail/utils/noteFlightGeometry.mjs";
import { getThemePalette } from "../src/features/jarDetail/theme/jarDetailTheme";
import apiClient from "../src/api/apiClient";
import { SLOT_CATALOG } from "../src/features/jarDesign/slotCatalog.mjs";

// 실제 쪽지 작성 컴포넌트와 좌표를 검증하되 저장·인증·S3 요청은 모두 메모리에서 끝낸다.
if (!import.meta.env.DEV) throw new Error("로컬 개발 전용 화면입니다.");
let nextNoteId = 1;
let rejectNoteSave = false;
apiClient.defaults.adapter = async (config) => {
  let data;
  if (config.url.endsWith("/csrf")) data = { token: "local-fixture", headerName: "X-XSRF-TOKEN" };
  else if (config.url === "/api/v1/jars/999/notes" && config.method === "post") {
    if (rejectNoteSave) throw Object.assign(new Error("로컬 저장 실패 검증"), { config, response: { status: 503, data: { error: { message: "로컬 저장 실패 검증" } } } });
    data = { noteId: nextNoteId++ };
  }
  else if (config.url === "/api/v1/jars/999/notes") data = { items: [], page: 0, size: 6, totalElements: 0, totalPages: 1 };
  else throw new Error(`검증하지 않은 요청 차단: ${config.method} ${config.url}`);
  return { data: { data }, status: 200, statusText: "OK", headers: {}, config };
};
const imageUrl = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="480" height="480"><rect width="480" height="480" fill="#eff6ed"/><path d="M100 280Q240 80 380 280Q240 420 100 280Z" fill="#e4afbc"/><circle cx="240" cy="255" r="38" fill="#edcf78"/></svg>');

function NoteDropPreview() {
  const jarRef = useRef(null);
  const [kind, setKind] = useState("BEAR");
  const [x, setX] = useState(0.76);
  const [y, setY] = useState(0.62);
  const [slotStyle, setSlotStyle] = useState("METAL");
  const [held, setHeld] = useState(false);
  const [flight, setFlight] = useState(null);
  const [composerRequest, setComposerRequest] = useState(0);
  const [zoomOpened, setZoomOpened] = useState(false);
  const design = kind === "DEFAULT" ? null : { imageUrl, bodyStyle: kind === "LEGACY" ? null : kind,
    slotCenterX: x, slotCenterY: y, slotSizeRatio: 0.5, slotStyle };
  const jar = { jarId: 999, name: "내가 정한 입구로 쪽지 넣기", theme: "SPRING", myRole: "OWNER", isOpen: false, design };
  const palette = getThemePalette(jar.theme);
  function playFlight() {
    const geometry = createNoteFlight(measureJarDropTarget(jarRef.current), { width: innerWidth, height: innerHeight });
    if (geometry) setFlight({ id: Date.now(), ...geometry });
  }
  return <main className="mx-auto max-w-3xl px-5 py-8">
    {/* transform과 스크롤이 있는 부모 안에서도 portal은 뷰포트 위치를 유지해야 한다. */}
    <style>{`.jar-snowball-soft-float { animation: none !important; } ${held ? ".note-flight-paper { animation-play-state: paused !important; animation-delay: -828ms !important; }" : ""}`}</style>
    <h1 className="text-2xl font-black">사용자가 정한 입구 · 쪽지 투입 검증</h1>
    <p className="mt-2 text-sm text-slate-600">실제 쪽지 작성 화면입니다. 서버 저장은 하지 않습니다. 도착 고정 확인은 입구와 쪽지 중심을 비교합니다.</p>
    <div className="mt-5 flex flex-wrap items-center gap-4">
      <label>저금통 <select aria-label="검증 저금통" value={kind} onChange={(event) => { setFlight(null); setKind(event.target.value); }} className="rounded-xl border bg-white p-2"><option value="BEAR">허그 베어</option><option value="MOON">달의 안부</option><option value="LEGACY">이전 이미지 저금통</option><option value="DEFAULT">기본 테마 저금통</option></select></label>
      <label>가로 <input aria-label="검증 입구 가로" type="range" min="0.15" max="0.85" step="0.01" value={x} onChange={(event) => { setFlight(null); setX(Number(event.target.value)); }} /></label>
      <label>입구 <select aria-label="검증 입구 모양" value={slotStyle} onChange={event=>{setFlight(null);setSlotStyle(event.target.value);}} className="rounded-xl border bg-white p-2">{SLOT_CATALOG.map(entry=><option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label>
      <label>세로 <input aria-label="검증 입구 세로" type="range" min="0.1" max="0.9" step="0.01" value={y} onChange={(event) => { setFlight(null); setY(Number(event.target.value)); }} /></label>
      <label className="flex items-center gap-2"><input type="checkbox" checked={held} onChange={(event) => setHeld(event.target.checked)} />도착 지점 고정 확인</label>
      <label className="flex items-center gap-2"><input type="checkbox" onChange={(event) => { rejectNoteSave = event.target.checked; }} />저장 실패 검증</label>
      <button type="button" onClick={playFlight} className="rounded-xl bg-emerald-800 px-4 py-3 font-bold text-white">투입 애니메이션 재생</button>
    </div>
    <div className="mt-6 rounded-3xl border bg-white p-5" style={{ transform: "translate(11px, 7px)" }}>
      <JarVisual jar={jar} jarRef={jarRef} interactive onClick={()=>setZoomOpened(true)}/>
      <p className="mt-10 text-center text-xs text-slate-500">저장된 입구: {design ? `${Math.round(x * 100)}% / ${Math.round(y * 100)}%` : "기본 뚜껑 입구"}</p>
      {zoomOpened && <p role="status">쪽지 확인 버튼의 확대 콜백이 호출되었습니다.</p>}
      <button type="button" onClick={() => { setFlight(null); setComposerRequest((value) => value + 1); }} className="mx-auto mt-5 block rounded-xl bg-violet-700 px-5 py-3 font-bold text-white">새 쪽지 쓰기</button>
      <NoteSection jar={jar} palette={palette} formatDate={(value) => value || ""} getJarDropTargetRect={() => measureJarDropTarget(jarRef.current)} createRequestId={composerRequest} showSearchControls={false} />
    </div>
    <FlyingNote flight={flight} onAnimationEnd={() => setFlight(null)} />
    <div className="mt-8 h-[900px] rounded-3xl border border-dashed p-5 text-sm text-slate-500">스크롤을 이동한 뒤에도 같은 입구로 도착해야 합니다.</div>
  </main>;
}
const previewRoot = import.meta.hot?.data.root || createRoot(document.getElementById("root"));
if (import.meta.hot) import.meta.hot.data.root = previewRoot;
previewRoot.render(<NoteDropPreview />);
