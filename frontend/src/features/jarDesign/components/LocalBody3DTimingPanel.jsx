import {useEffect,useState} from "react";
import {body3DTimingReport} from "../body3DTiming.mjs";

/** 로컬에서 사용자가 켠 진단에만 붙는다. 화면을 재배치하지 않고 숫자 결과를 보이며 저장/전송은 하지 않는다. */
export default function LocalBody3DTimingPanel({rootRef}) {
  const [latest,setLatest]=useState(null),[count,setCount]=useState(0);
  useEffect(()=>{
    const root=rootRef.current;if(!root)return;
    const seen=new WeakMap();
    const collect=()=>{
      for(const stage of root.querySelectorAll("[data-body3d-timing]")) {
        const text=stage.getAttribute("data-body3d-timing");if(seen.get(stage)===text)continue;
        seen.set(stage,text);
        try {
          const report=body3DTimingReport(JSON.parse(text));
          if(report){setLatest(report);setCount(value=>value+1);}
        } catch { /* 불완전한 숫자 기록은 완료 결과로 취급하지 않는다. 원문을 출력하지 않는다. */ }
      }
    };
    const observer=new MutationObserver(collect);
    observer.observe(root,{attributes:true,attributeFilter:["data-body3d-timing"],childList:true,subtree:true});collect();
    return ()=>observer.disconnect();
  },[rootRef]);
  const breakdown=latest?.effectBreakdown;
  const milliseconds=value=>value==null?"미측정":`${value.toFixed(1)}ms`;
  return <details open data-local-body3d-diagnostic className="fixed bottom-2 right-2 z-[200] max-h-[45vh] w-[340px] max-w-[95vw] overflow-auto rounded-xl border border-emerald-300 bg-white p-3 text-xs text-stone-800 shadow-lg">
    <summary className="cursor-pointer font-bold">로컬 3D 시간 · 완료 {count}회</summary>
    <p className="my-2">최근 완료 기록입니다. GPU 완료 시간은 아니며 중첩 구간은 합산하지 않습니다. 새 측정은 2D에서 3D로 전환해 주세요.</p>
    {breakdown&&<p className="my-2" data-effect-breakdown>준비 실행 {breakdown.observedEffectCount}회 · 폐기 {breakdown.discardedEffectCount}회<br/>
      모양 계산: 출력에 사용 {milliseconds(breakdown.renderedEffect.bodyGeometryMs)} / 폐기된 준비 {milliseconds(breakdown.discardedEffects.bodyGeometryMs)}<br/>
      폐기된 준비에는 개발 검사나 다른 재실행이 포함될 수 있습니다. 출력에 사용한 시간도 운영 속도를 뜻하지 않습니다.</p>}
    {latest?<pre data-body3d-report className="select-text whitespace-pre-wrap break-words">{JSON.stringify(latest,null,2)}</pre>:<p>3D 전환 완료를 기다립니다.</p>}
  </details>;
}
