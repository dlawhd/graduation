import { useEffect, useRef } from "react";
import { drawShape } from "../drawingTools.mjs";

/** 실제 Canvas와 같은 그리기 함수를 사용해 도형 메뉴의 미리보기가 결과와 일치하게 한다. */
export default function ShapeSwatch({ shape, tone = "violet" }) {
  const ref = useRef(null);
  useEffect(() => {
    const ctx = ref.current.getContext("2d"); ctx.clearRect(0, 0, 48, 40);
    ctx.strokeStyle = tone === "mint" ? "#11785f" : "#6d28d9"; ctx.fillStyle = tone === "mint" ? "#e7f3ed" : "#ede9fe"; ctx.lineWidth = 2;
    drawShape(ctx, shape, { x: 6, y: 5 }, { x: 42, y: 35 }, true);
  }, [shape, tone]);
  return <canvas ref={ref} width="48" height="40" className="h-9 w-11" aria-hidden="true" />;
}
