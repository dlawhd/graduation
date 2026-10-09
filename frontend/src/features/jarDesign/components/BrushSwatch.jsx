import { useEffect, useRef } from "react";
import { drawBrushStroke } from "../drawingTools.mjs";

/** 메뉴에서도 실제 펜 렌더러를 사용해 선택한 질감과 완성 획을 일치시킨다. */
export default function BrushSwatch({ brush, color, silhouette = false }) {
  const ref = useRef(null);
  useEffect(() => {
    const ctx = ref.current.getContext("2d"); ctx.clearRect(0, 0, 90, 30);
    const points = Array.from({length:32},(_,i)=>({x:8+i*74/31,y:15+7*Math.sin(i*Math.PI*2/31)}));
    drawBrushStroke(ctx,points,{brush,color,size:9,silhouette});
  },[brush,color,silhouette]);
  return <canvas ref={ref} width="90" height="30" className="h-[30px] w-[90px]" aria-hidden="true"/>;
}
