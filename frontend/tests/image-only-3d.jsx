import React,{useState} from "react";
import {createRoot} from "react-dom/client";
import "../src/index.css";
import "../src/features/jarDesign/bodyWorkshop.css";
import JarDesignImage from "../src/features/jarDesign/components/JarDesignImage";
import {toCutoutMaskStyle} from "../src/features/jarDesign/cutoutGeometry.mjs";

// 서버 저장/로그인 없이 실제 이미지 단독 뷰어와 편집 미리보기 배치를 확인한다.
if(!import.meta.env.DEV)throw new Error("로컬 개발 전용 화면");
const drawing="data:image/svg+xml,"+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="480" height="480"><path d="M60 160Q60 50 180 95L240 145Q320 20 410 100Q485 230 360 340Q280 420 150 380Q35 340 60 160Z" fill="#fffdf8"/><path d="M105 205q50-80 70 5t-55 70m85-85 80 80m0-80-80 80" fill="none" stroke="#52798a" stroke-width="13" stroke-linecap="round"/><circle cx="370" cy="130" r="18" fill="#d69baf"/></svg>');
const photo="data:image/svg+xml,"+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="400"><rect width="800" height="400" fill="#abd9ce"/><circle cx="400" cy="200" r="130" fill="#fff5d7"/><text x="400" y="220" font-size="50" text-anchor="middle">Memory</text></svg>');
const mask=toCutoutMaskStyle([[{x:.15,y:.2},{x:.8,y:.2},{x:.8,y:.8},{x:.15,y:.8}]]);
function Preview(){
  const [target,setTarget]=useState(null),[source,setSource]=useState("drawing"),[cutout,setCutout]=useState(false),[slot,setSlot]=useState(false),[reset,setReset]=useState(0);
  return <main className="mx-auto max-w-[1440px] p-5"><h1 className="text-2xl font-black">이미지와 그림 · 3D 미리보기</h1>
    <div className="my-5 flex flex-wrap gap-2">{["drawing","photo","error"].map(id=><button key={id} className="rounded border bg-white px-3 py-2" onClick={()=>setSource(id)}>{id==="drawing"?"투명 그림":id==="photo"?"가로 사진":"이미지 오류"}</button>)}
    <button className="rounded border bg-white px-3 py-2" onClick={()=>setCutout(v=>!v)}>자르기 {cutout?"해제":"적용"}</button>
    <button className="rounded border bg-white px-3 py-2" onClick={()=>setSlot(v=>!v)}>입구 {slot?"숨기기":"표시"}</button>
    <button className="rounded border bg-white px-3 py-2" onClick={()=>setReset(v=>v+1)}>2D 복귀</button></div>
    <div className="studio-workspace"><section className="min-w-0 rounded-2xl border bg-white p-5"><h2 className="font-bold">그림판 영역</h2><p className="mt-2 text-sm">오른쪽 미리보기에서 이미지 윤곽에 두께를 더해 돌려볼 수 있어요.</p><div className="mt-4 aspect-square max-h-[540px] rounded-xl bg-slate-50"/></section>
    <aside className="studio-preview min-w-0 rounded-2xl border bg-white p-5"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-sm font-black">저금통에 담긴 모습</h2><div ref={setTarget}/></div><p className="mt-2 text-xs leading-5 text-slate-500">이미지·그림의 모양과 투명도를 유지해요.</p>
    <div className="studio-preview-stage mt-3 aspect-square rounded-2xl bg-[#e5f4ef]"><JarDesignImage key={source} imageUrl={source==="drawing"?drawing:source==="photo"?photo:"data:image/png;base64,invalid"} imageStyle={cutout?mask:undefined} alt="이미지 단독 미리보기" allow3D viewControlsTarget={target} frontViewRequest={reset} slot={slot?{centerX:.5,centerY:.35,sizeRatio:.18,slotStyle:"CLASSIC"}:null}/></div>
    <p className="mt-3 text-xs leading-5 text-slate-500">사진 속 대상 자체를 입체 모델로 바꾸지는 않아요.</p></aside></div>
  </main>;
}
const root=import.meta.hot?.data.root||createRoot(document.getElementById("root"));
if(import.meta.hot)import.meta.hot.data.root=root;
root.render(<Preview/>);
