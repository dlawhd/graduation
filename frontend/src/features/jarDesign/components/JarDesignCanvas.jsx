import { useEffect, useRef, useState } from "react";
import { drawingPoint, drawShape, hasDrawingPixels } from "../drawingTools.mjs";

const CANVAS_SIZE = 480;
const HISTORY_LIMIT = 25;
const TOOLS = [["pen", "펜", "✎"], ["eraser", "지우개", "▱"], ["line", "직선", "╱"], ["rectangle", "사각형", "□"], ["ellipse", "원", "○"], ["triangle", "삼각형", "△"]];
const COLORS = ["#1e293b", "#64748b", "#ffffff", "#ef4444", "#f97316", "#fbbf24", "#22c55e", "#14b8a6", "#3b82f6", "#8b5cf6", "#ec4899", "#f9a8d4"];
const controlClass = "rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 transition hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-40";

/**
 * 사용자가 Jar 원본을 직접 그리는 480×480 Canvas다.
 * 완료 버튼을 누를 때만 PNG Blob을 부모에게 전달해 불필요한 변환·업로드를 막는다.
 * 도형은 드래그 중 미리보기하고 완료된 작업만 최대 25단계로 보관한다.
 */
export default function JarDesignCanvas({ disabled, onConfirm }) {
  const canvasRef = useRef(null);
  const gestureRef = useRef(null);
  const historyRef = useRef([]);
  const indexRef = useRef(0);
  const exportingRef = useRef(false);
  const [historyState, setHistoryState] = useState({ index: 0, count: 1 });
  const [tool, setTool] = useState("pen");
  const [brushSize, setBrushSize] = useState(8);
  const [brushColor, setBrushColor] = useState("#64748b");
  const [fill, setFill] = useState(false);
  const [hasDrawing, setHasDrawing] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const locked = disabled || drawing || exporting;

  useEffect(() => {
    const context = canvasRef.current.getContext("2d");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    historyRef.current = [context.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE)];
  }, []);

  function syncHistory() {
    setHistoryState({ index: indexRef.current, count: historyRef.current.length });
    setHasDrawing(hasDrawingPixels(historyRef.current[indexRef.current].data));
  }

  /** 실행 취소 뒤 새로 그리면 이전 분기의 이력을 버리고 이미지 메모리도 제한한다. */
  function saveHistory() {
    const snapshot = canvasRef.current.getContext("2d").getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    const previous = historyRef.current[indexRef.current];
    if (snapshot.data.every((value, index) => value === previous.data[index])) return;
    historyRef.current = historyRef.current.slice(0, indexRef.current + 1);
    historyRef.current.push(snapshot);
    if (historyRef.current.length > HISTORY_LIMIT + 1) historyRef.current.shift();
    indexRef.current = historyRef.current.length - 1;
    syncHistory();
  }

  function moveHistory(delta) {
    if (locked) return;
    const index = indexRef.current + delta;
    if (index < 0 || index >= historyRef.current.length) return;
    indexRef.current = index;
    canvasRef.current.getContext("2d").putImageData(historyRef.current[index], 0, 0);
    syncHistory();
  }

  /** 포인터 좌표를 CSS 크기와 무관한 실제 480×480 좌표로 바꾼다. */
  function getCanvasPoint(event) {
    return drawingPoint(event.clientX, event.clientY, canvasRef.current.getBoundingClientRect(), CANVAS_SIZE);
  }

  /** 터치·펜·마우스를 하나의 Pointer Event 경로로 처리한다. */
  function startDrawing(event) {
    if (disabled || exportingRef.current || gestureRef.current || event.button !== 0 || !event.isPrimary) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = getCanvasPoint(event);
    const context = canvasRef.current.getContext("2d");
    gestureRef.current = { pointerId: event.pointerId, start: point, last: point, base: context.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE) };
    context.strokeStyle = tool === "eraser" ? "#ffffff" : brushColor;
    context.fillStyle = context.strokeStyle;
    context.lineWidth = brushSize;
    context.lineCap = "round";
    context.lineJoin = "round";
    // 클릭만 해도 점을 찍는다. 지우개는 서버 원본과 같은 흰 배경으로 복원한다.
    if (tool === "pen" || tool === "eraser") {
      context.beginPath();
      context.arc(point.x, point.y, brushSize / 2, 0, Math.PI * 2);
      context.fill();
    }
    setDrawing(true);
  }

  function draw(event) {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const context = canvasRef.current.getContext("2d");
    const point = getCanvasPoint(event);
    if (tool === "pen" || tool === "eraser") {
      context.beginPath(); context.moveTo(gesture.last.x, gesture.last.y); context.lineTo(point.x, point.y); context.stroke();
    } else {
      // 매번 시작 이미지를 복원해 도형 미리보기의 잔상이 남지 않게 한다.
      context.putImageData(gesture.base, 0, 0);
      drawShape(context, tool, gesture.start, point, fill);
    }
    gesture.last = point;
  }

  function stopDrawing(event, cancel = false) {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    if (cancel) canvasRef.current.getContext("2d").putImageData(gesture.base, 0, 0);
    else { draw(event); saveHistory(); }
    gestureRef.current = null;
    setDrawing(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  /** 사용자의 그림만 지우고 흰 480×480 원본으로 되돌린다. 실행 취소로 복구할 수 있다. */
  function clearCanvas() {
    if (locked) return;
    const context = canvasRef.current.getContext("2d");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    saveHistory();
  }

  /** Canvas 내용을 서버가 받는 실제 PNG Blob으로 변환한다. */
  function confirmDrawing() {
    if (!hasDrawing || locked || exportingRef.current) return;
    exportingRef.current = true;
    setExporting(true);
    setError("");
    canvasRef.current.toBlob((blob) => {
      exportingRef.current = false;
      setExporting(false);
      if (!blob) { setError("그림을 변환하지 못했어요. 다시 시도해 주세요."); return; }
      onConfirm(new File([blob], "jar-design-drawing.png", { type: "image/png" }));
    }, "image/png");
  }

  return (
    <section className="overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/80 p-4">
        <div><h3 className="font-black text-slate-800">나만의 작은 그림판</h3><p className="mt-1 text-xs text-slate-500">선을 그리고, 도형을 더하고, 색을 입혀요.</p></div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={controlClass} disabled={locked || historyState.index === 0} onClick={() => moveHistory(-1)}>↶ 실행 취소</button>
          <button type="button" className={controlClass} disabled={locked || historyState.index === historyState.count - 1} onClick={() => moveHistory(1)}>↷ 다시 실행</button>
          <button type="button" className={controlClass} disabled={locked || !hasDrawing} onClick={clearCanvas}>전체 지우기</button>
        </div>
      </div>
      <fieldset disabled={locked} className="border-b border-slate-100 p-4">
        <legend className="sr-only">그리기 도구</legend>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {TOOLS.map(([value, label, icon]) => <button key={value} type="button" aria-pressed={tool === value} onClick={() => setTool(value)} className={`flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl border text-xs font-bold transition disabled:cursor-not-allowed ${tool === value ? "border-violet-500 bg-violet-50 text-violet-700 ring-1 ring-violet-500" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}><span aria-hidden="true" className="text-2xl leading-7">{icon}</span>{label}</button>)}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-xs font-bold text-slate-600">색상<input aria-label="사용자 지정 색상" type="color" value={brushColor} onChange={(event) => setBrushColor(event.target.value)} className="h-9 w-10 rounded border border-slate-200 bg-white p-1" /></label>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="색상 팔레트">{COLORS.map((color) => <button key={color} type="button" aria-label={`색상 ${color}`} aria-pressed={brushColor === color} onClick={() => setBrushColor(color)} className={`h-7 w-7 rounded-full border border-slate-300 ${brushColor === color ? "ring-2 ring-violet-500 ring-offset-2" : ""}`} style={{ backgroundColor: color }} />)}</div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <label className="flex min-w-40 flex-1 items-center gap-3 text-xs font-bold text-slate-600">굵기<input type="range" min="1" max="48" value={brushSize} onChange={(event) => setBrushSize(Number(event.target.value))} className="min-w-16 flex-1 accent-violet-600" /><span className="w-9 tabular-nums">{brushSize}px</span></label>
          <label className="flex items-center gap-2 text-xs font-bold text-slate-600"><input type="checkbox" checked={fill} onChange={(event) => setFill(event.target.checked)} disabled={locked || !["rectangle", "ellipse", "triangle"].includes(tool)} className="accent-violet-600" />도형 내부 채우기</label>
        </div>
      </fieldset>
      <div className="bg-slate-100/70 p-3 sm:p-5">
        <canvas ref={canvasRef} width={CANVAS_SIZE} height={CANVAS_SIZE} onPointerDown={startDrawing} onPointerMove={draw} onPointerUp={(event) => stopDrawing(event)} onPointerCancel={(event) => stopDrawing(event, true)} onLostPointerCapture={(event) => stopDrawing(event, true)}
          className="mx-auto block aspect-square w-full max-w-[560px] touch-none bg-white shadow-sm" style={{ cursor: disabled ? "not-allowed" : tool === "eraser" ? "cell" : "crosshair" }} aria-label="저금통 디자인 캔버스" />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 p-4">
        <p className="text-xs leading-5 text-slate-500">480 × 480 PNG · 최대 25단계 되돌리기<br />도형은 캔버스를 누르고 드래그해 그려요.</p>
        <button type="button" onClick={confirmDrawing} disabled={locked || !hasDrawing} className="rounded-xl bg-violet-600 px-5 py-3 text-sm font-black text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-40">{exporting ? "그림 변환 중..." : "이 그림 사용하기 →"}</button>
      </div>
      {error && <p role="alert" className="px-4 pb-4 text-sm text-rose-600">{error}</p>}
    </section>
  );
}
