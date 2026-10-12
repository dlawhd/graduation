import React, { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "../src/index.css";
import JarDesignImage from "../src/features/jarDesign/components/JarDesignImage";
import CustomJarBodyViewer from "../src/features/jarDesign/components/CustomJarBodyViewer";
import CustomJarBodyArtwork from "../src/features/jarDesign/components/CustomJarBodyArtwork";
import { basicBodyOutline, customJarBody } from "../src/features/jarDesign/customJarBody.mjs";
import { coverPhotoFrame, containPhotoFrame } from "../src/features/jarDesign/photoFraming.mjs";
import { measureJarDropTarget } from "../src/features/jarDetail/utils/noteFlightGeometry.mjs";
import { CHARACTER_SHAPES } from "../src/features/jarDesign/characterShapes.mjs";
import { drawShape } from "../src/features/jarDesign/drawingTools.mjs";
import { paintedBodyOutline } from "../src/features/jarDesign/bodyPainting.mjs";
import JarVisual from "../src/features/jarDetail/components/JarVisual";
import { DEEP_BODY_FIXTURE, narrowBodyFixture } from "./fixtures/body3DShapes.mjs";

// 개발 전용 합성 이미지로 확인한다. 로그인/운영 API/AI 생성 요청은 없다.
if(!import.meta.env.DEV)throw new Error("로컬 개발 전용");
const photo="data:image/svg+xml,"+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="480" height="480"><rect width="240" height="240" fill="#8dcbb3"/><rect x="240" width="240" height="240" fill="#efbdce"/><rect y="240" width="240" height="240" fill="#f7d28b"/><rect x="240" y="240" width="240" height="240" fill="#a3b3dd"/><circle cx="240" cy="240" r="110" fill="white"/><text x="240" y="255" font-size="44" text-anchor="middle" fill="#294438">Memory</text></svg>');
const basics=["ROUND","JAR","SQUARE"].map(kind=>[kind,basicBodyOutline(kind)]);
const slot={centerX:.5,centerY:.42,sizeRatio:-.15,slotStyle:"METAL"};
function Preview() {
  const [body,setBody]=useState(basics[0][1]),[frame,setFrame]=useState(null),[request,setRequest]=useState(0),[target,setTarget]=useState(null);
  const jarRef=useRef(null),[zoomCount,setZoomCount]=useState(0);
  function useCharacter(id) {
    const canvas=document.createElement("canvas");canvas.width=canvas.height=480;
    const ctx=canvas.getContext("2d");ctx.strokeStyle="#eab0c5";ctx.lineWidth=8;ctx.lineJoin="round";
    drawShape(ctx,id,{x:80,y:60},{x:400,y:420},false);
    const result=paintedBodyOutline(ctx.getImageData(0,0,480,480),"#eab0c5",{encloseInterior:true});
    if(!result.error)setBody(result.value);
  }
  return <main className="mx-auto max-w-5xl p-5">
    <h1 className="text-xl font-black">직접 만든 틀의 3D 검증</h1>
    <p className="my-3 text-sm">운영 요청 없이 앞뒤 사진, 빈 틀, 회전과 정면 복귀를 확인합니다. 뒷면에서는 같은 사진과 글자가 좌우 반전됩니다.</p>
    <div className="flex flex-wrap gap-2">{basics.map(([name,value])=><button type="button" key={name} onClick={()=>setBody(value)} className="rounded border p-3">{name}</button>)}
      <button type="button" onClick={()=>setFrame(coverPhotoFrame(customJarBody(body).window,undefined,2,1,0))} className="rounded border p-3">오른쪽 위 확대</button>
      <button type="button" onClick={()=>setFrame(containPhotoFrame({x:0,y:.21875,width:1,height:.5625}))} className="rounded border p-3">전체 보기</button>
      <button type="button" onClick={()=>setFrame(null)} className="rounded border p-3">기본 사진 배치</button>
      <button type="button" onClick={()=>setRequest(r=>r+1)} className="rounded border p-3">쪽지 작성 열기</button>
      <button type="button" onClick={()=>setTarget(measureJarDropTarget(document.querySelector("[data-photo-fixture]")))} className="rounded border p-3">정면 입구 측정</button>
      <button type="button" onClick={()=>document.querySelector("canvas")?.dispatchEvent(new Event("webglcontextlost",{cancelable:true}))} className="rounded border p-3">컨텍스트 손실 재현</button>
      <button type="button" onClick={()=>setBody(narrowBodyFixture())} className="rounded border p-3">가는 팔다리 검증</button>
      <button type="button" onClick={()=>setBody(DEEP_BODY_FIXTURE)} className="rounded border p-3">깊은 굴곡 검증</button>
    </div>
    <div className="mt-3 flex flex-wrap gap-2">{CHARACTER_SHAPES.map(([id,label])=><button type="button" key={id} onClick={()=>useCharacter(id)} className="rounded border p-2 text-xs">{label}</button>)}</div>
    <div className="mt-6 grid items-start gap-6 md:grid-cols-2">
      <section><h2 className="mb-3 font-bold">사진과 저장한 입구</h2><div data-photo-fixture className="aspect-square rounded-3xl bg-stone-50">
        <JarDesignImage bodyStyle="CUSTOM" customBody={body} imageUrl={photo} photoFrame={frame} slot={slot} allow3D frontViewRequest={request}/>
      </div><p data-flight-target>{target?JSON.stringify(target):"입구 측정 전"}</p></section>
      <section><h2 className="mb-3 font-bold">속이 빈 기본 틀</h2><div className="aspect-square rounded-3xl bg-emerald-50">
        <CustomJarBodyViewer customBody={body} outlineOnly><CustomJarBodyArtwork customBody={body} outlineOnly/></CustomJarBodyViewer>
      </div></section>
    </div>
    <section className="mt-8 rounded-3xl bg-white p-4">
      <h2 className="mb-3 font-bold">실제 완성 저금통 컴포넌트</h2>
      <JarVisual jar={{name:"로컬 3D 저금통",theme:"SPRING",myRole:"OWNER",design:{bodyStyle:"CUSTOM",customBody:body,imageUrl:photo,photoFrame:frame,
        slotCenterX:slot.centerX,slotCenterY:slot.centerY,slotSizeRatio:slot.sizeRatio,slotStyle:slot.slotStyle}}}
        interactive jarRef={jarRef} frontViewRequest={request} onClick={()=>setZoomCount(n=>n+1)}/>
      <p className="mt-10" data-zoom-count>쪽지 확인 클릭: {zoomCount}</p>
    </section>
  </main>;
}
// HMR에서도 기존 root를 재사용한다.
const root=import.meta.hot?.data.root || createRoot(document.getElementById("root"));
if(import.meta.hot)import.meta.hot.data.root=root;
root.render(<Preview/>);
