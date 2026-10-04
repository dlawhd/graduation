import { useId } from "react";
import { slotGlints, slotGlintTiming } from "../slotGlints.mjs";

/** 배지 광택처럼 테두리 두 지점에서만 짧게 빛난다. 구멍·사진·쪽지 목표를 가리지 않는 장식 전용 SVG다. */
export default function SlotSparkles({ entry }) {
  const uid=`glint-${useId().replace(/:/g,"")}`;
  const timing=slotGlintTiming(entry.id), freeform=entry.freeform;
  return <svg aria-hidden="true" focusable="false" data-slot-sparkles={entry.id} viewBox={freeform?"0 0 100 100":"0 0 210 60"}
    className="pointer-events-none absolute inset-0 h-full w-full overflow-hidden">
    {entry.path && <defs><mask id={uid} maskUnits="userSpaceOnUse" x="0" y="0" width={freeform?100:210} height={freeform?100:60}>
      <path d={entry.path} fill="white"/>
      {freeform ? <path d={entry.path} fill="black" transform="translate(50 50) scale(.72) translate(-50 -50)"/>
        : <rect x="42" y="22" width="126" height="16" rx="8" fill="black"/>}
    </mask></defs>}
    <g mask={entry.path?`url(#${uid})`:undefined}>
      {slotGlints(entry).map(([x,y],index)=><g key={index} transform={`translate(${x} ${y})`} data-glint-anchor={`${x},${y}`}>
        <g className="slot-glint" style={{"--slot-glint-duration":`${timing.duration}s`,"--slot-glint-delay":`${timing.delay-index*2.3}s`}}>
          <path d="M0-5L1.1-1.1L5 0L1.1 1.1L0 5L-1.1 1.1L-5 0L-1.1-1.1Z" fill={entry.colors?.[3] || "#fff3cf"} fillOpacity=".8"/>
          <path d="M0 -3.4L.7 -.7L3.4 0L.7 .7L0 3.4L-.7 .7L-3.4 0L-.7 -.7Z" fill="#fff"/>
          <circle r=".8" fill="#fff"/>
        </g>
      </g>)}
    </g>
  </svg>;
}
