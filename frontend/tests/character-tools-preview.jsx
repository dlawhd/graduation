import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "../src/index.css";
import { CHARACTER_SHAPES } from "../src/features/jarDesign/characterShapes.mjs";
import { BODY_BRUSHES, drawShape, drawBrushStroke } from "../src/features/jarDesign/drawingTools.mjs";
import { paintedBodyOutline } from "../src/features/jarDesign/bodyPainting.mjs";
import JarDesignCanvas from "../src/features/jarDesign/components/JarDesignCanvas";
import CustomJarBodyArtwork from "../src/features/jarDesign/components/CustomJarBodyArtwork";
import { basicBodyOutline } from "../src/features/jarDesign/customJarBody.mjs";

const previewPhoto = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="480" height="480"><rect width="480" height="480" fill="#dbeafe"/><circle cx="240" cy="210" r="110" fill="#f9a8d4"/><path d="M80 480L240 250L400 480" fill="#a7f3d0"/></svg>');

/** 실제 브라우저의 Canvas를 기존 저장 좌표로 변환한다. 운영 API와 사용자 사진은 사용하지 않는다. */
function ShapeProbe({ id, label, report }) {
  const canvas = useRef(null);
  const [result, setResult] = useState(null);
  useEffect(() => {
    const context = canvas.current.getContext("2d", { willReadFrequently: true });
    let error = "";
    // 정방향/역방향과 보통/굵은 테두리를 모두 확인한다. 실제 저장에는 펜 굵기도 포함된다.
    for (const reverse of [false, true]) for (const size of [1, 24, 64]) {
      context.clearRect(0, 0, 480, 480);
      context.fillStyle = "#d7e9df"; context.strokeStyle = "#d7e9df"; context.lineWidth = size; context.lineJoin = "round";
      const start = { x: 80, y: 60 }, end = { x: 400, y: 420 };
      drawShape(context, id, reverse ? end : start, reverse ? start : end, true);
      const check = paintedBodyOutline(context.getImageData(0, 0, 480, 480));
      if (check.error) error += `${reverse ? "역방향" : "정방향"}/${size}px: ${check.error} `;
    }
    // 비교 화면은 보통 굵기와 실제 좌표 렌더러를 함께 표시한다.
    context.clearRect(0, 0, 480, 480); context.lineWidth = 24;
    drawShape(context, id, { x: 80, y: 60 }, { x: 400, y: 420 }, true);
    const firstResult = paintedBodyOutline(context.getImageData(0, 0, 480, 480));
    setResult({ ...firstResult, error }); report(id, !error);
  }, [id, report]);
  return <article className="rounded-2xl border border-violet-100 bg-white p-4" data-character-check={result ? (!result.error ? "PASS" : "FAIL") : "WAIT"}>
    <h2 className="font-bold text-slate-700">{label}</h2>
    <div className="grid grid-cols-2 gap-2"><canvas ref={canvas} width="480" height="480" className="w-full" aria-label={label + " 원본 실루엣"}/>{result?.value.points.length > 0 && <CustomJarBodyArtwork customBody={result.value} outlineOnly/>}</div>
    <p className="text-xs text-slate-500">{result ? result.error || `저장 가능 / ${result.value.points.length}점 / 6조건 통과` : "검사 중"}</p>
  </article>;
}

/** 기본 틀과 겹치는 실제 획을 검사해 새 펜으로 그린 부분이 좌표 저장에서 빠지지 않는지 확인한다. */
function BrushProbe({ id, label }) {
  const canvas = useRef(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    const context = canvas.current.getContext("2d", { willReadFrequently: true });
    context.clearRect(0, 0, 480, 480); context.fillStyle = "#d7e9df"; context.fillRect(120, 120, 240, 260);
    const points = Array.from({ length: 32 }, (_, i) => ({ x: 350 + i * 70 / 31, y: 200 + 25 * Math.sin(i * Math.PI / 31) }));
    drawBrushStroke(context, points, { brush: id, color: "#d7e9df", size: 36, silhouette: true });
    setError(paintedBodyOutline(context.getImageData(0, 0, 480, 480)).error);
  }, [id]);
  return <article data-brush-check={error == null ? "WAIT" : error ? "FAIL" : "PASS"} className="rounded-xl border bg-white p-3"><h3 className="text-sm font-bold">{label}</h3><canvas ref={canvas} width="480" height="480" className="w-full"/><p className="text-xs">{error == null ? "검사 중" : error || "획과 틀 연결 / 저장 가능"}</p></article>;
}

/** 기존 두 그림판의 도구를 직접 조작하는 개발 전용 검증 화면이다. 네트워크 요청을 만들지 않는다. */
function Preview() {
  const [value, setValue] = useState({ points: [], color: "#d7e9df" });
  const [checks, setChecks] = useState({}), [confirmed, setConfirmed] = useState("");
  const [report] = useState(() => (id, passed) => setChecks(current => ({ ...current, [id]: passed })));
  return <main className="mx-auto max-w-6xl space-y-6 px-4 py-6">
    <h1 className="text-2xl font-black text-slate-800">캐릭터 친구들과 손끝의 질감</h1>
    <p className="text-sm text-slate-600">로컬 전용. 원본 실루엣과 저장된 틀을 나란히 비교합니다. 서버 요청 없음.</p>
    <section className="grid items-start gap-5 lg:grid-cols-[2fr_1fr]"><JarDesignCanvas purpose="BODY" bodyValue={value} onBodyChange={setValue} onConfirm={() => setConfirmed("틀 확정 완료")}/><aside className="rounded-2xl border bg-white p-4"><h2 className="font-bold">저장 좌표 미리보기</h2><CustomJarBodyArtwork customBody={value} outlineOnly/><p role="status">{confirmed}</p></aside></section>
    <section className="rounded-2xl bg-emerald-50 p-4"><h2 className="font-bold">빈 틀과 사진 합성 비교</h2><div className="grid grid-cols-3 gap-3">{[[true, "", "빈 내부 테두리"], [true, previewPhoto, "사진이 있으면 기존 합성"], [false, "", "기존 기본 렌더링"]].map(([outlineOnly, imageUrl, label]) => <div key={label}><CustomJarBodyArtwork customBody={basicBodyOutline("JAR", "#ffffff")} {...{outlineOnly, imageUrl}} alt={label}/><p className="text-xs">{label}</p></div>)}</div></section>
    <h2 className="text-xl font-black">캐릭터 12종 저장 검사</h2><p data-character-summary>{Object.values(checks).filter(Boolean).length}/12 통과</p>
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{CHARACTER_SHAPES.map(([id, label]) => <ShapeProbe key={id} id={id} label={label} report={report}/>)}</div>
    <h2 className="text-xl font-black">틀용 펜 8종 저장 검사</h2><div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{BODY_BRUSHES.map(([id, label]) => <BrushProbe key={id} id={id} label={label}/>)}</div>
    <h2 className="text-xl font-black">기존 사진 그림판</h2><JarDesignCanvas onConfirm={file => setConfirmed(`PNG 확정: ${file.type}`)}/>
  </main>;
}
createRoot(document.getElementById("root")).render(<Preview/>);
