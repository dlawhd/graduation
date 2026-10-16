import React,{useState} from "react";
import {createRoot} from "react-dom/client";
import "../src/index.css";
import JarBodyWorkshop from "../src/features/jarDesign/components/JarBodyWorkshop";
import {basicBodyOutline} from "../src/features/jarDesign/customJarBody.mjs";
import JarDesignCanvas from "../src/features/jarDesign/components/JarDesignCanvas";
import JarDesignImage from "../src/features/jarDesign/components/JarDesignImage";
import {paintedBodyOutline} from "../src/features/jarDesign/bodyPainting.mjs";
import {insetBodyContours} from "../src/features/jarDesign/bodyContours.mjs";

// 실제 공방을 로그인/API 저장 없이 검증한다. 기본 틀 안에 펜으로 선을 추가해 볼 수 있다.
if(!import.meta.env.DEV)throw new Error("로컬 개발 전용 화면");
const photo="data:image/svg+xml,"+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="480" height="480"><rect width="480" height="480" fill="#f1bdc7"/></svg>');
function thinBody(thickness=1){
  const canvas=document.createElement("canvas");canvas.width=canvas.height=480;
  const context=canvas.getContext("2d"),basic=basicBodyOutline("ROUND");
  context.beginPath();basic.points.forEach((p,i)=>{const x=(.5+(p.x-.5)*.8)*480,y=(.5+(p.y-.5)*.8)*480;i?context.lineTo(x,y):context.moveTo(x,y);});context.closePath();
  context.strokeStyle=basic.color;context.lineWidth=thickness;context.stroke();
  const pixels=context.getImageData(0,0,480,480),result=paintedBodyOutline(pixels,basic.color,{encloseInterior:true});
  if(result.error)throw new Error(result.error);
  const contours=insetBodyContours(result.value.points,pixels.data);
  return {...result.value,...(contours.length?{photoContours:contours}:{}),artworkUrl:canvas.toDataURL("image/png")};
}
function Preview(){
  const [value,setValue]=useState(()=>basicBodyOutline("ROUND")),[withPhoto,setWithPhoto]=useState(false),[continued,setContinued]=useState(false),[imageStep,setImageStep]=useState(false);
  return <main className="mx-auto max-w-[1440px] p-5"><h1 className="text-xl font-black">틀 공방 · 내부 꾸밈과 밑선 확인</h1><button type="button" className="mt-3 rounded border bg-white p-2" onClick={()=>setWithPhoto(v=>!v)}>사진 {withPhoto?"빼기":"미리보기"}</button>
    <button className="ml-2 rounded border bg-white p-2" onClick={()=>{setValue(thinBody());setWithPhoto(false);}}>1px 틀 예제</button>
    <button className="ml-2 rounded border bg-white p-2" onClick={()=>{setValue(thinBody(53));setWithPhoto(false);}}>53px 틀 예제</button>
    <button className="ml-2 rounded border bg-white p-2" onClick={()=>setImageStep(v=>!v)}>편집 단계 전환</button>
    <output data-workshop-state className="mt-2 block break-all text-xs">{JSON.stringify({points:value?.points?.length,artwork:Boolean(value?.artworkUrl),photoContours:value?.photoContours?.length,continued})}</output>
    {imageStep?<section className="image-input-studio mt-6"><div className="studio-workspace"><div className="studio-editor min-w-0"><JarDesignCanvas workshopLayout onConfirm={()=>{}} toolboxHeader={<p className="studio-basic-section text-sm font-bold">사진·그림 추가</p>}/></div><aside className="studio-preview h-fit rounded-2xl border bg-white p-5"><h2 className="font-bold">저금통에 담긴 모습</h2><div className="mt-3 aspect-square rounded-2xl bg-[#f3f7f5]"><JarDesignImage bodyStyle="CUSTOM" customBody={value} imageUrl={withPhoto?photo:""} allow3D/></div><p className="mt-3 text-sm">그림을 확정하거나 이미지를 골라 저금통 안을 채워주세요.</p><button className="mt-4 min-h-12 w-full rounded-xl bg-emerald-800 text-white">이 그림으로 다음 단계 →</button></aside></div></section>:<JarBodyWorkshop value={value} onChange={setValue} previewUrl={withPhoto?photo:""} onContinue={()=>setContinued(true)} onOpenCatalog={()=>{}} onImageOnly={()=>{}}/>}
  </main>;
}
const root=import.meta.hot?.data.root||createRoot(document.getElementById("root"));
if(import.meta.hot)import.meta.hot.data.root=root;
root.render(<Preview/>);
