import { Component, lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { customJarBody } from "../customJarBody.mjs";
import { BODY_3D_FAILURE } from "../body3DGeometry.mjs";

const CustomJarBody3D=lazy(()=>import("./CustomJarBody3D"));

/** 청크 다운로드/렌더 오류도 디자인 편집 전체가 아닌 3D 영역에서만 처리한다. */
class ViewerBoundary extends Component {
  state={failed:false};
  static getDerivedStateFromError() { return {failed:true}; }
  componentDidCatch() { this.props.onFailure(); }
  render() { return this.state.failed?null:this.props.children; }
}

/** 기본 2D는 계속 유지하고 요청한 경우에만 3D 코드와 GPU를 사용한다. DB/API/원본을 변경하지 않는다. */
export default function CustomJarBodyViewer({ customBody,imageUrl,photoFrame,imageStyle,imageRendering,
  outlineOnly,slot,children,className="h-full w-full",frontViewRequest=0,disabled=false }) {
  const [mode,setMode]=useState("2D"),[failure,setFailure]=useState(""),[resetKey,setResetKey]=useState(0);
  const body=useMemo(()=>customJarBody(customBody),[customBody]);
  const onFailure=useCallback(message=>{setMode("2D");setFailure(message || BODY_3D_FAILURE);},[]);
  // 쪽지 작성 창을 열기 전에 정면으로 복귀한다. 기존 입구 위치 측정/애니메이션을 그대로 사용한다.
  useEffect(()=>{setMode("2D");setFailure("");},[frontViewRequest,imageUrl]);
  useEffect(()=>{if(disabled)setMode("2D");},[disabled]);
  return <div data-custom-body-viewer data-view-mode={mode} className={`relative isolate aspect-square ${className}`}>
    <div className="h-full w-full" hidden={mode==="3D"}>{children}</div>
    {mode==="3D" && <div className="pointer-events-auto absolute inset-0">
      <ViewerBoundary onFailure={onFailure}><Suspense fallback={<div role="status" className="flex h-full items-center justify-center bg-white/80 text-xs text-stone-500">3D를 불러오고 있어요…</div>}>
        <CustomJarBody3D {...{customBody,imageUrl,photoFrame,imageStyle,imageRendering,outlineOnly,slot,resetKey,onFailure}}/>
      </Suspense></ViewerBoundary>
    </div>}
    {body && <div className="pointer-events-auto absolute right-2 top-2 z-20 flex flex-wrap justify-end gap-1 rounded-full border border-stone-200 bg-white/95 p-1 shadow-sm">
      <button type="button" disabled={disabled} aria-pressed={mode==="3D"} onClick={()=>{setFailure("");setMode(m=>m==="3D"?"2D":"3D");}}
        className="min-h-9 rounded-full px-3 text-[11px] font-bold text-emerald-800 disabled:opacity-40">{mode==="3D"?"2D로 보기":"3D로 보기"}</button>
      {mode==="3D" && <button type="button" onClick={()=>setResetKey(k=>k+1)} className="min-h-9 rounded-full bg-stone-100 px-3 text-[11px] font-bold text-stone-600">정면으로</button>}
    </div>}
    {failure && <p role="status" className="pointer-events-none absolute inset-x-2 bottom-2 rounded-xl bg-white/95 p-2 text-center text-[10px] leading-4 text-stone-600">{failure}</p>}
  </div>;
}
