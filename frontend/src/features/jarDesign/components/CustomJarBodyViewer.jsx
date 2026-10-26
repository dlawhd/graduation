import { Component, lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { customJarBody } from "../customJarBody.mjs";
import { BODY_3D_FAILURE } from "../body3DGeometry.mjs";
import { createBody3DTiming,localBody3DTimingEnabled } from "../body3DTiming.mjs";
import LocalBody3DTimingPanel from "./LocalBody3DTimingPanel";

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
  outlineOnly,slot,children,className="h-full w-full",frontViewRequest=0,disabled=false,preparedBody=null,controlsOutside=false,viewerStageStyle,viewControlsTarget=null,imageTextureUrl,bodyArtworkTextureUrl,imageOnly=false }) {
  const [mode,setMode]=useState("2D"),[failure,setFailure]=useState(""),[resetKey,setResetKey]=useState(0);
  const timingRef=useRef(null);
  const viewerRef=useRef(null);
  const localTiming=import.meta.env.DEV&&localBody3DTimingEnabled({development:true,hostname:window.location.hostname,
    pathname:window.location.pathname,search:window.location.search});
  /** 진단 URL에서만 계측한다. 일반 개발 화면과 운영 빌드에서는 타이머를 만들지 않는다. */
  function toggleMode() {
    // 실제 상세/만들기도 localhost의 명시적 diagnose3d=1 진단 URL에서만 포함한다.
    if((import.meta.env.DEV && window.location.pathname==="/tests/jar-3d-timing.html")||localTiming) {
      timingRef.current?.cancel();
      timingRef.current=mode==="2D"?createBody3DTiming({enabled:true}):null;
    }
    setFailure("");setMode(m=>m==="3D"?"2D":"3D");
  }
  const body=useMemo(()=>imageOnly?Boolean(imageUrl):preparedBody || customJarBody(customBody),[customBody,preparedBody,imageOnly,imageUrl]);
  const onFailure=useCallback(message=>{setMode("2D");setFailure(message || BODY_3D_FAILURE);},[]);
  // 쪽지 작성 창을 열기 전에 정면으로 복귀한다. 기존 입구 위치 측정/애니메이션을 그대로 사용한다.
  useEffect(()=>{setMode("2D");setFailure("");},[frontViewRequest,imageUrl]);
  useEffect(()=>{if(disabled)setMode("2D");},[disabled]);
  // 상세 화면의 장식 레이어는 pointer-events:none이다. 실제 조작 영역만 다시 활성화한다.
  const controls=body && <div data-view-controls className={`pointer-events-auto ${viewControlsTarget?"flex min-h-8 flex-wrap items-center justify-end gap-1":controlsOutside?"flex min-h-8 shrink-0 flex-wrap items-center justify-end gap-1 pb-2":"absolute right-2 top-2 z-20 flex flex-wrap justify-end gap-1 rounded-full border border-stone-200 bg-white/95 p-0.5 shadow-sm"}`}>
    <button type="button" disabled={disabled} aria-pressed={mode==="3D"} onClick={toggleMode}
      className="min-h-8 min-w-8 rounded-full border border-stone-200 bg-white px-2.5 text-[11px] font-bold text-emerald-800 hover:bg-emerald-50 disabled:opacity-40">{mode==="3D"?"2D로 보기":"3D로 보기"}</button>
    {mode==="3D" && <button type="button" onClick={()=>setResetKey(k=>k+1)} className="min-h-8 min-w-8 rounded-full bg-stone-100 px-2.5 text-[11px] font-bold text-stone-600 hover:bg-stone-200">정면으로</button>}
  </div>;
  return <div ref={viewerRef} data-custom-body-viewer data-view-mode={mode} data-controls-outside={controlsOutside} className={`relative isolate ${controlsOutside?"flex flex-col":"aspect-square"} ${className}`}>
    {import.meta.env.DEV&&localTiming&&createPortal(<LocalBody3DTimingPanel rootRef={viewerRef}/>,document.body)}
    {/* 회전 상태는 이 뷰어에 유지하고 버튼 DOM만 카드 제목줄로 옮긴다. */}
    {viewControlsTarget ? createPortal(controls,viewControlsTarget) : controlsOutside && controls}
    {/* 고정 높이 편집 미리보기에서도 버튼 높이만큼 사진 창을 찌그러뜨리지 않는다. 남은 공간 안에 정사각형을 맞춘다. */}
    <div className={controlsOutside?"relative grid min-h-0 flex-1 aspect-square place-items-center":"h-full w-full"} style={controlsOutside?{containerType:"size"}:undefined}>
    <div data-view-stage className="relative h-full w-full" style={controlsOutside?{...viewerStageStyle,width:"min(100cqw, 100cqh)",height:"min(100cqw, 100cqh)"}:viewerStageStyle}>
    <div className="h-full w-full" hidden={mode==="3D"}>{children}</div>
    {mode==="3D" && <div className="pointer-events-auto absolute inset-0">
      <ViewerBoundary onFailure={onFailure}><Suspense fallback={<div role="status" className="flex h-full items-center justify-center bg-white/80 text-xs text-stone-500">3D를 불러오고 있어요…</div>}>
        <CustomJarBody3D {...{customBody,imageUrl,photoFrame,imageStyle,imageRendering,outlineOnly,slot,resetKey,onFailure,preparedBody,imageTextureUrl,bodyArtworkTextureUrl,imageOnly}} timing={timingRef.current}/>
      </Suspense></ViewerBoundary>
    </div>}
    {!viewControlsTarget && !controlsOutside && controls}
    {failure && <p role="status" className="pointer-events-none absolute inset-x-2 bottom-2 rounded-xl bg-white/95 p-2 text-center text-[10px] leading-4 text-stone-600">{failure}</p>}
    </div>
    </div>
  </div>;
}
