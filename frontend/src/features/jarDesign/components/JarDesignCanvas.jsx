import { useEffect, useRef, useState } from "react";
import { BRUSHES, SHAPES, constrainShape, drawBrushStroke, drawingPoint, drawShape, floodFill, hasDrawingPixels, sampledColor } from "../drawingTools.mjs";
import StudioIcon from "./StudioIcon";
import ShapeSwatch from "./ShapeSwatch";

const CANVAS_SIZE = 480;
const HISTORY_LIMIT = 25;
const TOOLS = [["pen", "펜"], ["eraser", "지우개"], ["shapes", "도형"], ["fill", "채우기"], ["eyedropper", "스포이드"], ["text", "텍스트"], ["select", "선택"]];
const COLORS = ["#1e293b", "#64748b", "#ffffff", "#ef4444", "#fb7185", "#f97316", "#fbbf24", "#a3e635", "#22c55e", "#14b8a6", "#38bdf8", "#3b82f6", "#8b5cf6", "#d946ef", "#f9a8d4", "#92400e"];
const controlClass = "inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 transition hover:bg-violet-50 focus-visible:outline-violet-600 disabled:cursor-not-allowed disabled:opacity-40";

/**
 * 사용자가 Jar 원본을 직접 그리는 480×480 Canvas다.
 * 완료 버튼을 누를 때만 PNG Blob을 부모에게 전달해 불필요한 변환·업로드를 막는다.
 * 도형은 드래그 중 미리보기하고 완료된 작업만 최대 25단계로 보관한다.
 */
export default function JarDesignCanvas({ disabled, onConfirm, onDirtyChange }) {
  const canvasRef = useRef(null), gestureRef = useRef(null), historyRef = useRef([]), indexRef = useRef(0);
  const exportingRef = useRef(false), selectionRef = useRef(null);
  const [historyState, setHistoryState] = useState({ index: 0, count: 1 });
  const [tool, setTool] = useState("pen"), [brush, setBrush] = useState("pen"), [shape, setShape] = useState("rectangle");
  const [picker, setPicker] = useState("");
  const [brushSize, setBrushSize] = useState(8), [brushColor, setBrushColor] = useState("#334155");
  const [fillColor, setFillColor] = useState("#f9a8d4"), [opacity, setOpacity] = useState(100), [fill, setFill] = useState(false);
  const [textValue, setTextValue] = useState(""), [fontSize, setFontSize] = useState(32), [fontBold, setFontBold] = useState(true);
  const [zoom, setZoom] = useState(1), [grid, setGrid] = useState(false), [selection, setSelection] = useState(null);
  const [hasDrawing, setHasDrawing] = useState(false), [drawing, setDrawing] = useState(false);
  const [exporting, setExporting] = useState(false), [error, setError] = useState("");
  const locked = disabled || drawing || exporting;

  useEffect(() => {
    const context = canvasRef.current.getContext("2d", { willReadFrequently: true });
    context.fillStyle = "#ffffff"; context.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    historyRef.current = [context.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE)];
  }, []);

  function syncHistory() {
    setHistoryState({ index: indexRef.current, count: historyRef.current.length });
    setHasDrawing(hasDrawingPixels(historyRef.current[indexRef.current].data));
    onDirtyChange?.(true);
  }

  /** 실행 취소 뒤 새로 그리면 이전 분기의 이력을 버리고 이미지 메모리도 제한한다. */
  function saveHistory() {
    const snapshot = canvasRef.current.getContext("2d").getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    const previous = historyRef.current[indexRef.current];
    if (snapshot.data.every((value, index) => value === previous.data[index])) return;
    historyRef.current = historyRef.current.slice(0, indexRef.current + 1);
    historyRef.current.push(snapshot);
    if (historyRef.current.length > HISTORY_LIMIT + 1) historyRef.current.shift();
    indexRef.current = historyRef.current.length - 1; syncHistory();
  }

  function clearSelection() { selectionRef.current = null; setSelection(null); }
  function moveHistory(delta) {
    if (locked) return;
    const index = indexRef.current + delta;
    if (index < 0 || index >= historyRef.current.length) return;
    clearSelection(); indexRef.current = index;
    canvasRef.current.getContext("2d").putImageData(historyRef.current[index], 0, 0); syncHistory();
  }

  /** 포인터 좌표를 CSS 크기와 무관한 실제 480×480 좌표로 바꾼다. */
  function getCanvasPoint(event) {
    return drawingPoint(event.clientX, event.clientY, canvasRef.current.getBoundingClientRect(), CANVAS_SIZE);
  }

  function chooseTool(value) {
    clearSelection(); setTool(value); setError("");
    setPicker(value === "pen" || value === "shapes" ? (picker === value ? "" : value) : "");
  }

  /** 터치·펜·마우스를 하나의 Pointer Event 경로로 처리한다. */
  function startDrawing(event) {
    if (disabled || exportingRef.current || gestureRef.current || event.button !== 0 || !event.isPrimary) return;
    // 드래그 도중 도구 패널 높이가 바뀌면 Canvas 위치가 움직여 좌표가 튄다. 패널은 유지한다.
    event.preventDefault(); canvasRef.current.focus({ preventScroll: true }); setError("");
    const point = getCanvasPoint(event), context = canvasRef.current.getContext("2d");
    if (tool === "eyedropper") { setBrushColor(sampledColor(context, point)); setTool("pen"); return; }
    if (tool === "fill") {
      const image = context.getImageData(0, 0, 480, 480);
      if (floodFill(image, point.x, point.y, brushColor)) { context.putImageData(image, 0, 0); saveHistory(); }
      return;
    }
    if (tool === "text") {
      if (!textValue.trim()) { setError("위 입력란에 글자를 적은 뒤 캔버스에서 놓을 곳을 눌러주세요."); return; }
      context.save(); context.fillStyle = brushColor; context.globalAlpha = opacity / 100;
      context.font = (fontBold ? "700 " : "400 ") + fontSize + "px sans-serif"; context.textBaseline = "top";
      context.fillText(textValue, Math.min(point.x, Math.max(0, 480 - context.measureText(textValue).width)), Math.min(point.y, 480 - fontSize), 480);
      context.restore(); saveHistory(); return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    const selected = selectionRef.current;
    const moving = tool === "select" && selected && point.x >= selected.x && point.x <= selected.x + selected.w && point.y >= selected.y && point.y <= selected.y + selected.h;
    if (!moving) clearSelection();
    const initial = context.getImageData(0, 0, 480, 480);
    gestureRef.current = { pointerId: event.pointerId, start: point, last: point, points: [point],
      base: initial, initial, moving, selected };
    setDrawing(true);
    // 클릭만 해도 점을 찍는다. 지우개는 서버 원본과 같은 흰 배경으로 복원한다.
    if (tool === "pen" || tool === "eraser") paintStroke(context, gestureRef.current);
  }

  function paintStroke(context, gesture) {
    context.putImageData(gesture.base, 0, 0);
    drawBrushStroke(context, gesture.points, { brush: tool === "eraser" ? "pen" : brush,
      color: tool === "eraser" ? "#ffffff" : brushColor, size: brushSize, opacity: tool === "eraser" ? 1 : opacity / 100 });
  }

  function draw(event) {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const context = canvasRef.current.getContext("2d"), point = getCanvasPoint(event);
    if (tool === "pen" || tool === "eraser") {
      if (Math.hypot(point.x - gesture.last.x, point.y - gesture.last.y) > .5) {
        // 획이 길어져도 질감 도구의 재그리기 비용에 상한을 둔다.
        if (gesture.points.length >= 2048) { gesture.base = context.getImageData(0, 0, 480, 480); gesture.points = [gesture.last]; }
        gesture.points.push(point);
      }
      paintStroke(context, gesture);
    } else if (tool === "shapes") {
      // 매번 시작 이미지를 복원해 도형 미리보기의 잔상이 남지 않게 한다.
      context.putImageData(gesture.base, 0, 0); context.save();
      context.strokeStyle = brushColor; context.fillStyle = fillColor; context.lineWidth = brushSize;
      context.lineCap = "round"; context.lineJoin = "round"; context.globalAlpha = opacity / 100;
      drawShape(context, shape, gesture.start, event.shiftKey ? constrainShape(gesture.start, point) : point, fill); context.restore();
    } else if (tool === "select") {
      if (gesture.moving) {
        const s = gesture.selected;
        const next = { ...s, x: Math.round(Math.max(0, Math.min(480 - s.w, s.x + point.x - gesture.start.x))),
          y: Math.round(Math.max(0, Math.min(480 - s.h, s.y + point.y - gesture.start.y))) };
        context.putImageData(gesture.base, 0, 0); context.fillStyle = "#ffffff"; context.fillRect(s.x, s.y, s.w, s.h);
        context.putImageData(s.image, next.x, next.y); setSelection(next); gesture.nextSelection = next;
      } else setSelection(selectionBounds(gesture.start, point));
    }
    gesture.last = point;
  }

  function selectionBounds(start, end) {
    return { x: Math.floor(Math.min(start.x, end.x)), y: Math.floor(Math.min(start.y, end.y)),
      w: Math.floor(Math.abs(end.x - start.x)), h: Math.floor(Math.abs(end.y - start.y)) };
  }

  function stopDrawing(event, cancel = false) {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const context = canvasRef.current.getContext("2d");
    if (cancel) { context.putImageData(gesture.initial, 0, 0); clearSelection(); }
    else {
      draw(event);
      if (tool === "select") {
        const s = gesture.moving ? gesture.nextSelection : selectionBounds(gesture.start, gesture.last);
        if (s?.w > 0 && s?.h > 0) { const next = { ...s, image: context.getImageData(s.x, s.y, s.w, s.h) }; selectionRef.current = next; setSelection(next); }
        else clearSelection();
      }
      saveHistory();
    }
    gestureRef.current = null; setDrawing(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function deleteSelection() {
    if (locked || !selectionRef.current) return;
    const { x, y, w, h } = selectionRef.current, ctx = canvasRef.current.getContext("2d");
    ctx.fillStyle = "#ffffff"; ctx.fillRect(x, y, w, h); clearSelection(); saveHistory();
  }

  /** 사용자의 그림만 지우고 흰 480×480 원본으로 되돌린다. 실행 취소로 복구할 수 있다. */
  function clearCanvas() {
    if (locked || !window.confirm("그림 전체를 지울까요? 실행 취소로 되돌릴 수 있어요.")) return;
    clearSelection(); const context = canvasRef.current.getContext("2d");
    context.fillStyle = "#ffffff"; context.fillRect(0, 0, 480, 480); saveHistory();
  }

  /** 회전과 반전은 복사본을 그려 원본 픽셀 손실 없이 한 번의 실행 취소로 복구한다. */
  function transformCanvas(kind) {
    if (locked) return;
    clearSelection(); const copy = document.createElement("canvas"); copy.width = 480; copy.height = 480;
    copy.getContext("2d").drawImage(canvasRef.current, 0, 0);
    const ctx = canvasRef.current.getContext("2d"); ctx.save(); ctx.translate(240, 240);
    if (kind === "rotate") ctx.rotate(Math.PI / 2); else ctx.scale(-1, 1);
    ctx.drawImage(copy, -240, -240); ctx.restore(); saveHistory();
  }

  function handleKey(event) {
    if (locked || /INPUT|TEXTAREA|SELECT/.test(event.target.tagName)) return;
    const key = event.key.toLowerCase();
    if ((event.ctrlKey || event.metaKey) && ["z", "y"].includes(key)) { event.preventDefault(); moveHistory(key === "y" || event.shiftKey ? 1 : -1); }
    else if (key === "delete" || key === "backspace") { event.preventDefault(); deleteSelection(); }
    else if (key === "escape") { clearSelection(); setPicker(""); }
    else if (!event.ctrlKey && !event.metaKey && !event.altKey) {
      const shortcuts = { b: "pen", e: "eraser", g: "fill", i: "eyedropper", t: "text", s: "select" };
      if (shortcuts[key]) chooseTool(shortcuts[key]);
    }
  }

  /** Canvas 내용을 서버가 받는 실제 PNG Blob으로 변환한다. */
  function exportDrawing(download = false) {
    if (!hasDrawing || locked || exportingRef.current) return;
    exportingRef.current = true; setExporting(true); setError("");
    canvasRef.current.toBlob((blob) => {
      exportingRef.current = false; setExporting(false);
      if (!blob) { setError("그림을 변환하지 못했어요. 다시 시도해 주세요."); return; }
      if (download) {
        const url = URL.createObjectURL(blob), anchor = document.createElement("a");
        anchor.href = url; anchor.download = "memory-jar-drawing.png"; anchor.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      } else { onConfirm(new File([blob], "jar-design-drawing.png", { type: "image/png" })); onDirtyChange?.(false); }
    }, "image/png");
  }

  const help = { pen: "자유롭게 그려보세요. 펜 버튼을 누르면 6가지 질감을 고를 수 있어요.", eraser: "드래그해서 지워요. 굵기로 지우개 크기를 조절하세요.", shapes: "누르고 드래그해 그려요. Shift를 누르면 가로·세로가 같아져요.", fill: "색칠할 닫힌 영역을 누르세요. 현재 펜 색으로 채워요.", eyedropper: "그림에서 가져올 색을 누르세요. 펜으로 자동 전환돼요.", text: "글자를 입력하고 그림 위에서 놓을 곳을 누르세요.", select: "영역을 선택하고 안쪽을 끌어 이동해요. Delete로 삭제, Esc로 선택 해제." }[tool];
  return (
    <section onKeyDown={handleKey} className="overflow-hidden rounded-[24px] border border-violet-100 bg-white shadow-sm" aria-label="그림판">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-violet-100 bg-gradient-to-r from-violet-50 to-pink-50 p-4">
        <div><p className="text-[10px] font-black tracking-[.2em] text-violet-500">MEMORY ATELIER</p><h3 className="mt-1 font-black text-slate-800">작은 상상이 시작되는 그림판</h3></div>
        <div className="flex gap-1.5">
          <button type="button" className={controlClass} title="실행 취소 (Ctrl+Z)" aria-label="실행 취소" disabled={locked || historyState.index === 0} onClick={() => moveHistory(-1)}><StudioIcon name="undo" size={18} /></button>
          <button type="button" className={controlClass} title="다시 실행 (Ctrl+Shift+Z)" aria-label="다시 실행" disabled={locked || historyState.index === historyState.count - 1} onClick={() => moveHistory(1)}><StudioIcon name="redo" size={18} /></button>
          <button type="button" className={controlClass} title="PNG 저장" aria-label="PNG 내려받기" disabled={locked || !hasDrawing} onClick={() => exportDrawing(true)}><StudioIcon name="download" size={18} /></button>
          <button type="button" className={controlClass} title="전체 지우기" aria-label="전체 지우기" disabled={locked || !hasDrawing} onClick={clearCanvas}><StudioIcon name="trash" size={18} /></button>
        </div>
      </div>
      <fieldset disabled={locked} className="border-b border-slate-100 p-3 sm:p-4">
        <legend className="sr-only">그리기 도구</legend>
        <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-7">
          {TOOLS.map(([value, label]) => <button key={value} type="button" aria-pressed={tool === value} aria-expanded={["pen", "shapes"].includes(value) ? picker === value : undefined} onClick={() => chooseTool(value)} className={"flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl text-xs font-bold transition " + (tool === value ? "bg-violet-600 text-white shadow-md shadow-violet-200" : "bg-slate-50 text-slate-600 hover:bg-violet-50")}><StudioIcon name={value} />{label}{["pen", "shapes"].includes(value) ? " ⌄" : ""}</button>)}
        </div>
        {picker === "pen" && <div className="mt-3 grid grid-cols-2 gap-2 rounded-2xl border border-violet-100 bg-violet-50/50 p-3 sm:grid-cols-3" aria-label="펜 종류">{BRUSHES.map(([value, label]) => <button key={value} type="button" aria-pressed={brush === value} onClick={() => { setBrush(value); setPicker(""); }} className={controlClass + " flex-col " + (brush === value ? "ring-2 ring-violet-400" : "")}><svg viewBox="0 0 80 24" className="h-6 w-20" aria-hidden="true"><path d="M5 18 Q20 -2 38 12 T75 6" fill="none" stroke={brushColor} strokeWidth={value === "pencil" ? 1.5 : value === "marker" ? 12 : value === "fountain" ? 5 : 6} opacity={value === "marker" ? .35 : 1} strokeLinecap={value === "fountain" ? "square" : "round"} strokeDasharray={["crayon", "spray"].includes(value) ? "1 4" : undefined} /></svg>{label}</button>)}</div>}
{picker === "shapes" && <div className="mt-3 grid max-h-72 grid-cols-3 overflow-y-auto overscroll-contain sm:max-h-none gap-2 rounded-2xl border border-violet-100 bg-violet-50/50 p-3 sm:grid-cols-6" aria-label="도형 종류">{SHAPES.map(([value, label]) => <button key={value} type="button" aria-pressed={shape === value} onClick={() => { setShape(value); setPicker(""); }} className={controlClass + " flex-col px-1 " + (shape === value ? "ring-2 ring-violet-400" : "")}><ShapeSwatch shape={value} />{label}</button>)}</div>}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-xs font-bold text-slate-600">펜 색<input aria-label="사용자 지정 색상" type="color" value={brushColor} onChange={(event) => setBrushColor(event.target.value)} className="h-9 w-10 cursor-pointer rounded-lg border border-slate-200 bg-white p-1" /></label>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="색상 팔레트">{COLORS.map((color) => <button key={color} type="button" aria-label={"색상 " + color} aria-pressed={brushColor === color} onClick={() => setBrushColor(color)} className={"h-7 w-7 rounded-full border border-slate-300 " + (brushColor === color ? "ring-2 ring-violet-500 ring-offset-2" : "")} style={{ backgroundColor: color }} />)}</div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="flex items-center gap-2 text-xs font-bold text-slate-600">굵기<input aria-label="도구 굵기" type="range" min="1" max="64" value={brushSize} onChange={(event) => setBrushSize(Number(event.target.value))} className="min-w-12 flex-1 accent-violet-600" /><span className="w-9 tabular-nums">{brushSize}px</span></label>
          <label className="flex items-center gap-2 text-xs font-bold text-slate-600">불투명도<input aria-label="불투명도" type="range" min="10" max="100" value={opacity} disabled={tool === "eraser" || tool === "fill"} onChange={(event) => setOpacity(Number(event.target.value))} className="min-w-12 flex-1 accent-violet-600" /><span className="w-9 tabular-nums">{opacity}%</span></label>
        </div>
        {tool === "shapes" && <div className="mt-3 flex flex-wrap items-center gap-3 text-xs font-bold text-slate-600"><span>{SHAPES.find(([v]) => v === shape)?.[1]}</span><label className="flex items-center gap-2"><input type="checkbox" checked={fill} onChange={(event) => setFill(event.target.checked)} disabled={shape === "line"} className="accent-violet-600" />내부 채우기</label><label className="flex items-center gap-2">채움 색<input type="color" value={fillColor} onChange={(event) => setFillColor(event.target.value)} aria-label="도형 채움 색" className="h-8 w-9" /></label></div>}
        {tool === "text" && <div className="mt-3 flex flex-wrap gap-2"><input aria-label="그림에 넣을 글자" placeholder="여기에 글자를 입력하세요" maxLength={60} value={textValue} onChange={(e) => setTextValue(e.target.value)} className="min-w-0 flex-1 rounded-xl border border-violet-200 px-3 py-2 text-sm" /><select aria-label="글자 크기" value={fontSize} onChange={(e) => setFontSize(Number(e.target.value))} className={controlClass}>{[16, 24, 32, 48, 64, 80].map((s) => <option key={s} value={s}>{s}px</option>)}</select><button type="button" aria-pressed={fontBold} onClick={() => setFontBold(!fontBold)} className={controlClass}>굵게 {fontBold ? "✓" : ""}</button></div>}
        {tool === "select" && <button type="button" disabled={locked || !selection} onClick={deleteSelection} className={controlClass + " mt-3"}>선택 영역 삭제</button>}
      </fieldset>
      <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 px-3 py-2">
        <span className="text-xs font-bold text-violet-700">{tool === "pen" ? BRUSHES.find(([v]) => v === brush)?.[1] : TOOLS.find(([v]) => v === tool)?.[1]}</span>
        <div className="flex flex-wrap gap-1">
          <button type="button" className={controlClass} aria-label="오른쪽으로 90도 회전" disabled={locked || !hasDrawing} onClick={() => transformCanvas("rotate")}><StudioIcon name="rotate" size={16} /></button>
          <button type="button" className={controlClass} aria-label="좌우 반전" disabled={locked || !hasDrawing} onClick={() => transformCanvas("flip")}><StudioIcon name="flip" size={16} /></button>
          <button type="button" className={controlClass} aria-label="격자 표시" aria-pressed={grid} onClick={() => setGrid(!grid)}><StudioIcon name="grid" size={16} /></button>
          <select aria-label="캔버스 확대" disabled={locked} className={controlClass} value={zoom} onChange={(e) => setZoom(Number(e.target.value))}><option value="1">화면 맞춤</option><option value="1.5">150%</option><option value="2">200%</option><option value="3">300%</option></select>
        </div>
      </div>
      <div className="max-h-[650px] overflow-auto bg-[#edeaf3] p-3 sm:p-5">
        <div className="relative mx-auto shadow-md" style={{ width: (zoom * 100) + "%", maxWidth: zoom === 1 ? 560 : undefined, aspectRatio: "1" }}>
          <canvas ref={canvasRef} width={480} height={480} tabIndex={0} onPointerDown={startDrawing} onPointerMove={draw} onPointerUp={(event) => stopDrawing(event)} onPointerCancel={(event) => stopDrawing(event, true)} onLostPointerCapture={(event) => stopDrawing(event, true)}
            className="block h-full w-full touch-none bg-white focus-visible:outline-2 focus-visible:outline-violet-400" style={{ cursor: disabled ? "not-allowed" : tool === "select" ? "move" : "crosshair" }} aria-label="저금통 디자인 캔버스" aria-describedby="drawing-help" />
          {grid && <div aria-hidden="true" className="pointer-events-none absolute inset-0" style={{ backgroundImage: "linear-gradient(#7c3aed18 1px,transparent 1px),linear-gradient(90deg,#7c3aed18 1px,transparent 1px)", backgroundSize: "5% 5%" }} />}
          {selection && <div aria-hidden="true" className="pointer-events-none absolute border-2 border-dashed border-violet-600 bg-violet-200/10" style={{ left: (selection.x / 4.8) + "%", top: (selection.y / 4.8) + "%", width: (selection.w / 4.8) + "%", height: (selection.h / 4.8) + "%" }} />}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="max-w-sm"><p id="drawing-help" className="text-xs leading-5 text-slate-600">{help}</p><p className="mt-1 text-[10px] text-slate-400">480 × 480 PNG · 최대 25단계 되돌리기 · Ctrl+Z / Ctrl+Shift+Z</p></div>
        <button type="button" onClick={() => exportDrawing()} disabled={locked || !hasDrawing} className="rounded-xl bg-violet-600 px-5 py-3 text-sm font-black text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-40">{exporting ? "그림 변환 중..." : "이 그림 사용하기 →"}</button>
      </div>
      {error && <p role="alert" className="px-4 pb-4 text-sm text-rose-600">{error}</p>}
    </section>
  );
}
