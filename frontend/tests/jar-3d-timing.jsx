import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "../src/index.css";
import JarBodyStage from "../src/features/jarDesign/components/JarBodyStage";
import CustomJarBodyViewer from "../src/features/jarDesign/components/CustomJarBodyViewer";
import CustomJarBodyArtwork from "../src/features/jarDesign/components/CustomJarBodyArtwork";
import LocalBody3DTimingPanel from "../src/features/jarDesign/components/LocalBody3DTimingPanel";
import JarVisual from "../src/features/jarDetail/components/JarVisual";
import { getJarBody } from "../src/features/jarDesign/jarBodies.mjs";
import { basicBodyOutline } from "../src/features/jarDesign/customJarBody.mjs";
import { IRREGULAR_BODY_OUTLINE } from "./fixtures/irregularBodyOutline.mjs";
import { preparedBodyOutline } from "../src/features/jarDesign/preparedBody3D.mjs";

// 테스트 화면은 배포 진입점이 아니다. 로그인·운영 API·AI 생성·외부 이미지 요청을 하지 않는다.
if(!import.meta.env.DEV)throw new Error("로컬 개발 전용 진단 화면");
const CASES=[
  ["detail-prepared","상세 · 레서판다와 합성 사진"],
  ["create-prepared","만들기 · 레서판다 빈 도안"],
  ["detail-custom","상세 · 직접 그린 둥근 틀과 합성 사진"],
  ["create-custom","만들기 · 직접 그린 빈 틀"],
  ["detail-image","상세 · 투명 PNG 이미지만 사용"],
  ["detail-irregular","상세 · 제공된 사진형 윤곽과 합성 사진"],
  ["create-irregular","만들기 · 제공된 사진형 빈 윤곽"],
];
const METRICS=[
  ["total","클릭 → 모든 텍스처 render 반환"],
  ["component","클릭 → 3D 컴포넌트 실행"],
  ["profile","윤곽·사진 공간 검사"],
  ["rendererInit","WebGL 초기화"],
  ["bodyGeometry","몸통 모양 계산"],
  ["rimTessellation","↳ 테두리 표면 분할"],
  ["rimHeightField","↳ 테두리 곡면 높이 계산"],
  ["rimSurfaceVertices","↳ 테두리 정점 생성"],
  ["photoTessellation","↳ 사진 표면 분할"],
  ["photoHeightField","↳ 사진 곡면 높이 계산"],
  ["photoSurfaceVertices","↳ 사진 곡면 정점 생성"],
  ["flatBase","↳ 바닥 자르기·닫기"],
  ["preparedVolume","기본 도안 두께 보정"],
  ["materialGroups","앞뒤 재질 구분"],
  ["photoSource","사진 소스 확보 (로컬 URL 해석)"],
  ["photoLoadToOnload","사진 로딩 → onload (대기 포함)"],
  ["borderLoadToOnload","테두리 로딩 → onload (대기 포함)"],
  ["photoCanvasAndTexture","사진 합성·텍스처 준비 (하위 계산 포함)"],
  ["borderCanvasAndDecorations","테두리 합성·장식 (하위 계산 포함)"],
  ["preparedDecorations","바깥 장식 모양 계산"],
  ["borderPixelExpansion","테두리 색 확장"],
  ["imageOnlyGeometry","투명 PNG 모양 계산"],
  ["renderSubmit","render 호출의 CPU 시간 합계"],
];
const sum=(result,name)=>result.spans.filter(span=>span.name===name).reduce((total,span)=>total+span.durationMs,0);
const value=(result,name)=>name==="total"?result.marks.texturedRenderEnd:name==="component"?result.marks.componentRender:sum(result,name);
const milliseconds=number=>Number.isFinite(number)?`${number.toFixed(2)} ms`:"—";

/** 비공개 사진을 테스트 저장소에 넣지 않고도 실제 2D/3D 컴포넌트의 비용을 비교할 수 있는 PNG다. */
function syntheticPhoto() {
  const canvas=document.createElement("canvas");canvas.width=canvas.height=480;
  const context=canvas.getContext("2d");
  context.fillStyle="#d7e9df";context.beginPath();context.ellipse(240,240,190,205,0,0,Math.PI*2);context.fill();
  context.fillStyle="#eaaeb9";context.fillRect(130,170,220,170);
  context.fillStyle="#fffdf8";context.beginPath();context.arc(240,210,66,0,Math.PI*2);context.fill();
  context.fillStyle="#254e40";context.font="bold 24px sans-serif";context.textAlign="center";context.fillText("Memory Jar",240,310);
  return canvas.toDataURL("image/png");
}

/** 클릭 한 번의 완료 결과를 보존한다. React 갱신/회전으로 같은 측정이 중복 집계되지 않게 한다. */
function TimingPage() {
  // 카탈로그의 실제 SVG 96점만 검증용으로 노출한다. 개인 사진/로그인 데이터는 읽지 않는다.
  const benchmarkOutlines=useMemo(()=>new URLSearchParams(window.location.search).get("benchmark-outlines")==="1"
    ?["FOX","RED_PANDA"].map(id=>{const body=getJarBody(id),path=document.createElementNS("http://www.w3.org/2000/svg","path");
      return {id,catalogPath:body.path,value:preparedBodyOutline(body,path)};}):null,[]);
  const [caseId,setCaseId]=useState("detail-prepared"),[results,setResults]=useState([]),[failure,setFailure]=useState("");
  const stageRef=useRef(null),jarRef=useRef(null),photo=useMemo(syntheticPhoto,[]),outline=useMemo(()=>basicBodyOutline("ROUND"),[]);
  const selectedOutline=caseId.includes("irregular")?IRREGULAR_BODY_OUTLINE:outline;
  const latest=results.filter(result=>result.caseId===caseId).at(-1);
  const runs=results.filter(result=>result.caseId===caseId);
  useEffect(()=>{
    const host=stageRef.current,seen=new WeakMap();
    const collect=()=>{
      for(const stage of host.querySelectorAll("[data-body3d-timing]")) {
        const serialized=stage.getAttribute("data-body3d-timing");
        if(seen.get(stage)===serialized)continue;
        seen.set(stage,serialized);
        try {
          const result=JSON.parse(serialized);
          if(result.status!=="complete"||!Number.isFinite(result.marks?.texturedRenderEnd))continue;
          setFailure("");setResults(previous=>[...previous.slice(-199),{...result,caseId}]);
        } catch {setFailure("계측 결과를 해석하지 못했습니다. 이 실행은 통계에서 제외합니다.");}
      }
      const error=Array.from(host.querySelectorAll('[role="status"]')).find(el=>el.textContent.includes("2D로"));
      if(error)setFailure(`3D 전환 실패 · 통계 제외: ${error.textContent}`);
    };
    const observer=new MutationObserver(collect);
    observer.observe(host,{attributes:true,attributeFilter:["data-body3d-timing"],childList:true,subtree:true});
    collect();
    return ()=>observer.disconnect();
  },[caseId]);
  const jar=useMemo(()=>({name:"합성 진단 저금통",theme:"SPRING",myRole:"OWNER",design:{
    bodyStyle:["detail-custom","detail-irregular"].includes(caseId)?"CUSTOM":caseId==="detail-image"?null:"RED_PANDA",
    customBody:selectedOutline,imageUrl:photo,
  }}),[caseId,selectedOutline,photo]);
  return <main className="mx-auto max-w-5xl p-5 text-stone-800">
    {new URLSearchParams(window.location.search).get("live-panel")==="1"&&<LocalBody3DTimingPanel key={`panel-${caseId}`} rootRef={stageRef}/>}
    <h1 className="text-2xl font-black">저금통 3D 구간별 성능 진단</h1>
    {benchmarkOutlines&&<details><summary>합성 카탈로그 윤곽 검증 데이터</summary><pre data-benchmark-outlines>{JSON.stringify(benchmarkOutlines)}</pre></details>}
    <p className="mt-3 text-sm leading-6">운영 요청 없는 로컬 합성 데이터입니다. 첫 실행은 코드 로딩을 포함할 수 있고, 반복 실행은 같은 페이지에서 2D → 3D로 전환합니다. 새로고침은 다운로드 캐시를 비우지 않습니다.</p>
    <p className="mt-2 text-sm leading-6 text-amber-900">완료 기준은 모든 사진/테두리를 사용한 renderer.render 반환입니다. GPU 완료·실제 모니터 출력 시간은 측정하지 않습니다. 로딩 구간에는 이미지 해석과 메인 스레드 대기가 포함되고, 중첩 구간은 서로 더하면 안 됩니다.</p>
    <label className="mt-4 block font-bold">측정 대상<select className="ml-2 max-w-full rounded border bg-white p-2" value={caseId} onChange={event=>{setFailure("");setCaseId(event.target.value);}}>{CASES.map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>
    <button type="button" className="mt-3 rounded border bg-white px-3 py-2 text-sm" onClick={()=>stageRef.current.querySelector("canvas")?.dispatchEvent(new Event("webglcontextlost",{cancelable:true}))}>3D 오류 복구 시험</button>
    <div key={caseId} ref={stageRef} data-timing-fixture className="mx-auto my-6 w-full max-w-[480px] rounded-3xl bg-[#fff5df] p-3">
      {caseId==="create-prepared"?<JarBodyStage body={getJarBody("RED_PANDA")} allow3D/>:
        ["create-custom","create-irregular"].includes(caseId)?<div className="aspect-square"><CustomJarBodyViewer customBody={selectedOutline} outlineOnly><CustomJarBodyArtwork customBody={selectedOutline} outlineOnly/></CustomJarBodyViewer></div>:
        <JarVisual jar={jar} jarRef={jarRef} interactive onClick={()=>{}}/>}
    </div>
    {failure&&<p role="alert" className="rounded bg-red-50 p-3 text-red-800">{failure}</p>}
    <section aria-label="측정 결과">
      <h2 className="text-xl font-bold">측정 결과 · 성공 {runs.length}회</h2>
      <p className="my-2 text-sm">{latest?`그리기 영역 ${latest.viewport.width}×${latest.viewport.height}, 배율 ${latest.viewport.pixelRatio.toFixed(2)}, 몸통 삼각형 ${latest.triangles.toLocaleString()}개` : "3D로 보기 버튼을 눌러주세요."}</p>
      <div className="overflow-x-auto"><table className="w-full border-collapse text-left text-sm"><thead><tr><th className="border p-2">측정 구간</th><th className="border p-2">최근 실행</th><th className="border p-2">반복 실행 중앙값 (첫 실행 제외)</th></tr></thead><tbody>{METRICS.map(([name,label])=>{
        const repeated=runs.slice(1).map(result=>value(result,name)).filter(Number.isFinite).sort((a,b)=>a-b),middle=Math.floor(repeated.length/2);
        const median=repeated.length?(repeated.length%2?repeated[middle]:(repeated[middle-1]+repeated[middle])/2):undefined;
        return <tr key={name}><th className="border p-2 font-normal">{label}</th><td className="border p-2">{milliseconds(latest&&value(latest,name))}</td><td className="border p-2">{milliseconds(median)}</td></tr>;
      })}</tbody></table></div>
      <p className="mt-3 text-xs">구간이 없는 경우 0 ms입니다. 통계는 최근 200개의 성공 실행만 보관하며 브라우저 저장소에는 저장하지 않습니다.</p>
      <details className="mt-3"><summary className="cursor-pointer font-bold">정밀 실행 기록 (개인정보 없음)</summary><pre data-timing-results className="mt-2 max-h-80 overflow-auto rounded bg-stone-100 p-3 text-xs">{JSON.stringify(results,null,2)}</pre></details>
    </section>
  </main>;
}
const root=import.meta.hot?.data.root||createRoot(document.getElementById("root"));
if(import.meta.hot)import.meta.hot.data.root=root;
// 실제 개발 앱의 StrictMode(효과를 정리하고 다시 실행하는 검사)도 같은 합성 데이터로 재현한다.
root.render(new URLSearchParams(window.location.search).get("strict-mode")==="1"
  ?<React.StrictMode><TimingPage/></React.StrictMode>:<TimingPage/>);
