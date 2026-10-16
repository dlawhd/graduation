import React, {useState,useEffect} from "react";
import {createRoot} from "react-dom/client";
import "../src/index.css";
import JarDesignImage from "../src/features/jarDesign/components/JarDesignImage";
import {getJarBody} from "../src/features/jarDesign/jarBodies.mjs";
import {PREPARED_3D_IDS,preparedBodyOutline,preparedBodyProfile} from "../src/features/jarDesign/preparedBody3D.mjs";
import {roundedBodyGeometry} from "../src/features/jarDesign/body3DMesh.mjs";
import {thickenPreparedBody} from "../src/features/jarDesign/preparedBodyVolume.mjs";
import {coverPhotoFrame} from "../src/features/jarDesign/photoFraming.mjs";

// 외부 API/로그인/유료 이미지 생성 없이 실제 3D 컴포넌트를 확인하는 개발 전용 화면이다.
if(!import.meta.env.DEV)throw new Error("로컬 개발 전용 화면");
const photo="data:image/svg+xml,"+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="480" height="480"><rect width="240" height="480" fill="#88bbae"/><rect x="240" width="240" height="480" fill="#f1bdc7"/><circle cx="240" cy="240" r="120" fill="#fff8e5"/><text x="240" y="255" text-anchor="middle" font-size="40">Memory</text></svg>');
function Preview(){
  const [withPhoto,setWithPhoto]=useState(false),[withSlot,setWithSlot]=useState(false),[reset,setReset]=useState(0);
  const [checks,setChecks]=useState([]);
  useEffect(()=>{
    // 모든 도면을 실제 브라우저 곡선으로 검사하되 GPU 컨텍스트는 생성하지 않는다.
    setChecks(PREPARED_3D_IDS.map(id=>{
      let geometry;
      try {
        const body=getJarBody(id),path=document.createElementNS("http://www.w3.org/2000/svg","path");
        const value=preparedBodyOutline(body,path),profile=preparedBodyProfile(value,body);
        geometry=thickenPreparedBody(roundedBodyGeometry(value,false,profile));
        return {id,safe:profile.photoSafe,triangles:geometry.index.count/3,
          finite:[...geometry.attributes.position.array,...geometry.attributes.normal.array].every(Number.isFinite)};
      }catch(error){return {id,error:error.message};}finally{geometry?.dispose();}
    }));
  },[]);
  return <main className="min-h-screen bg-[#f3f8f5] p-5">
    <h1 className="text-2xl font-black">다정한 친구 · 입체 미리보기</h1>
    <p className="my-3 text-sm">둥근 몸통, 살짝 도드라진 코와 리본. 각 친구의 3D로 보기 버튼을 눌러 돌려보세요.</p>
    <div className="my-4 flex flex-wrap gap-3">
      <button className="rounded border bg-white p-3" onClick={()=>setWithPhoto(value=>!value)}>사진 {withPhoto?"빼기":"담기"}</button>
      <button className="rounded border bg-white p-3" onClick={()=>setWithSlot(value=>!value)}>저장 입구 {withSlot?"숨기기":"표시"}</button>
      <button className="rounded border bg-white p-3" onClick={()=>setReset(value=>value+1)}>2D 정면 복귀</button>
      <button className="rounded border bg-white p-3" onClick={()=>document.querySelector("canvas")?.dispatchEvent(new Event("webglcontextlost",{cancelable:true}))}>3D 오류 복구 확인</button>
    </div>
    <output data-catalog-geometry-check className="block break-all text-xs">{JSON.stringify(checks)}</output>
    <div className="grid gap-5 md:grid-cols-3">{PREPARED_3D_IDS.map(id=>{
      const body=getJarBody(id);
      return <section key={id} data-prepared-fixture={id} className="min-w-0 rounded-3xl border border-stone-200 bg-white p-4">
        <h2 className="font-bold">{body.name}</h2>
        <div className="mt-3 aspect-square rounded-2xl" style={{background:body.stage.light}}>
          <JarDesignImage bodyStyle={id} imageUrl={withPhoto?photo:""} photoFrame={coverPhotoFrame(body.window)} slot={withSlot?body.slot:null} allow3D frontViewRequest={reset}/>
        </div>
      </section>;
    })}</div>
  </main>;
}
const root=import.meta.hot?.data.root||createRoot(document.getElementById("root"));
if(import.meta.hot)import.meta.hot.data.root=root;
root.render(<Preview/>);
