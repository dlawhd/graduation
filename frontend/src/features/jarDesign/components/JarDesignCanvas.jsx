import { useEffect, useRef, useState } from "react";

const CANVAS_SIZE = 480;

/**
 * 사용자가 Jar 원본을 직접 그리는 480×480 Canvas다.
 * 완료 버튼을 누를 때만 PNG Blob을 부모에게 전달해 불필요한 변환·업로드를 막는다.
 */
export default function JarDesignCanvas({ disabled, onConfirm }) {
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef(null);
  const [brushSize, setBrushSize] = useState(10);
  const [brushColor, setBrushColor] = useState("#64748b");
  const [hasDrawing, setHasDrawing] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!context) return;

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
  }, []);

  /** 포인터 좌표를 CSS 크기와 무관한 실제 480×480 좌표로 바꾼다. */
  function getCanvasPoint(event) {
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * CANVAS_SIZE,
      y: ((event.clientY - rect.top) / rect.height) * CANVAS_SIZE,
    };
  }

  /** 터치·펜·마우스를 하나의 Pointer Event 경로로 처리한다. */
  function startDrawing(event) {
    if (disabled) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drawingRef.current = true;
    lastPointRef.current = getCanvasPoint(event);
  }

  function draw(event) {
    if (!drawingRef.current || disabled) return;
    const context = canvasRef.current.getContext("2d");
    const nextPoint = getCanvasPoint(event);
    const previousPoint = lastPointRef.current;

    context.strokeStyle = brushColor;
    context.lineWidth = brushSize;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.beginPath();
    context.moveTo(previousPoint.x, previousPoint.y);
    context.lineTo(nextPoint.x, nextPoint.y);
    context.stroke();

    lastPointRef.current = nextPoint;
    setHasDrawing(true);
  }

  function stopDrawing(event) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    drawingRef.current = false;
    lastPointRef.current = null;
  }

  /** 사용자의 그림만 지우고 흰 480×480 원본으로 되돌린다. */
  function clearCanvas() {
    const context = canvasRef.current.getContext("2d");
    context.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    setHasDrawing(false);
  }

  /** Canvas 내용을 서버가 받는 실제 PNG Blob으로 변환한다. */
  function confirmDrawing() {
    if (!hasDrawing || disabled) return;
    canvasRef.current.toBlob((blob) => {
      if (!blob) return;
      onConfirm(new File([blob], "jar-design-drawing.png", { type: "image/png" }));
    }, "image/png");
  }

  return (
    <section className="rounded-[22px] border border-slate-200 bg-white/85 p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-black text-slate-800">직접 그리기</h3>
          <p className="mt-1 text-xs leading-5 text-slate-500">480 × 480 캔버스에 저금통의 모양을 그려보세요.</p>
        </div>
        <button type="button" onClick={clearCanvas} disabled={disabled}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50">
          다시 그리기
        </button>
      </div>

      <canvas ref={canvasRef} width={CANVAS_SIZE} height={CANVAS_SIZE}
        onPointerDown={startDrawing} onPointerMove={draw} onPointerUp={stopDrawing} onPointerCancel={stopDrawing}
        className="aspect-square w-full touch-none rounded-2xl border border-dashed border-slate-300 bg-white"
        aria-label="저금통 디자인 캔버스" />

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-xs font-bold text-slate-600">
          색상
          <input type="color" value={brushColor} onChange={(event) => setBrushColor(event.target.value)} disabled={disabled}
            className="h-9 w-10 cursor-pointer rounded border border-slate-200 bg-white p-1 disabled:cursor-not-allowed" />
        </label>
        <label className="flex min-w-40 flex-1 items-center gap-2 text-xs font-bold text-slate-600">
          굵기
          <input type="range" min="2" max="32" value={brushSize} onChange={(event) => setBrushSize(Number(event.target.value))}
            disabled={disabled} className="min-w-24 flex-1 accent-pink-500" />
          {brushSize}px
        </label>
        <button type="button" onClick={confirmDrawing} disabled={disabled || !hasDrawing}
          className="ml-auto rounded-xl bg-slate-800 px-4 py-2.5 text-xs font-black text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50">
          이 그림 사용하기
        </button>
      </div>
    </section>
  );
}
