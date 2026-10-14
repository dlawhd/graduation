import React,{useState} from "react";
import {createRoot} from "react-dom/client";
import {MemoryRouter} from "react-router-dom";
import "../src/index.css";
import JarVisual from "../src/features/jarDetail/components/JarVisual";
import JarCustomDesignVisual from "../src/features/jarDetail/components/JarCustomDesignVisual";
import JarDesignFinalizePanel from "../src/features/jarDesign/components/JarDesignFinalizePanel";
import {basicBodyOutline} from "../src/features/jarDesign/customJarBody.mjs";
import apiClient from "../src/api/apiClient";

// 운영 요청/생성 없이 실제 최종화·상세·목록 컴포넌트의 입구 개수와 버튼 클릭을 검증한다.
if(!import.meta.env.DEV)throw new Error("로컬 개발 전용 화면");
let textureRequests=0;
apiClient.defaults.adapter=async config=>{
  if(config.url==="/api/v1/jars/999/design/texture?part=IMAGE"){
    textureRequests++;
    return {data:await fixtureTextureBlob(),status:200,statusText:"OK",headers:{},config};
  }
  throw new Error("이 검증 화면에서는 외부 요청을 허용하지 않습니다.");
};
const photo="data:image/svg+xml,"+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="480" height="480"><rect width="480" height="480" fill="#c6e2e0"/><circle cx="240" cy="240" r="140" fill="#fffaf3"/><text x="240" y="255" text-anchor="middle" font-size="40">Memory</text></svg>');
let fixtureTexture;
/** 같은 합성 사진을 PNG 응답으로 제공한다. 실제 S3/운영 API는 호출하지 않는다. */
function fixtureTextureBlob(){
  if(!fixtureTexture)fixtureTexture=new Promise((resolve,reject)=>{
    const image=new Image();image.onerror=reject;
    image.onload=()=>{
      const canvas=document.createElement("canvas");canvas.width=canvas.height=480;
      canvas.getContext("2d").drawImage(image,0,0);
      canvas.toBlob(blob=>blob?resolve(blob):reject(new Error("Fixture PNG failed")),"image/png");
    };image.src=photo;
  });
  return fixtureTexture;
}
const customBody=basicBodyOutline("JAR");
function Preview(){
  const [kind,setKind]=useState("PANDA"),[zoomCount,setZoomCount]=useState(0),[proxy,setProxy]=useState(false),[requestCount,setRequestCount]=useState(0);
  const design={bodyStyle:kind==="IMAGE"?null:kind,customBody:kind==="CUSTOM"?customBody:null,imageUrl:photo,
    slotCenterX:.5,slotCenterY:.2,slotSizeRatio:.3,slotStyle:"LEAF_GATE",
    imageTextureUrl:proxy?"/api/v1/jars/999/design/texture?part=IMAGE":null};
  const draft={...design,draftId:999,status:"ACTIVE",selectedDesignType:"ORIGINAL",generations:[]};
  return <MemoryRouter><main className="bg-[#f3f8f5] p-5">
    <h1 className="text-xl font-bold">입구 중복·상세 3D 클릭 검증</h1>
    <div className="my-3 flex gap-2">{[["PANDA","준비된 판다"],["CUSTOM","직접 만든 틀"],["IMAGE","이미지 단독"]].map(([id,label])=><button key={id} className="rounded border bg-white p-3" onClick={()=>setKind(id)}>{label}</button>)}</div>
    <button className="rounded border bg-white p-3" onClick={()=>setProxy(value=>!value)}>인증 텍스처 경로 {proxy?"끄기":"켜기"}</button>
    <button className="rounded border bg-white p-3" onClick={()=>setRequestCount(textureRequests)}>텍스처 요청 수 확인</button><output data-texture-requests>{requestCount}</output>
    <div className="grid gap-8 lg:grid-cols-2">
      <section data-slot-fixture="detail" className="rounded-3xl bg-pink-50 p-5"><h2 className="font-bold">저장된 저금통 상세</h2>
        <JarVisual key={kind} jar={{name:"입구 검증",theme:"SPRING",myRole:"OWNER",design}} interactive onClick={()=>setZoomCount(value=>value+1)}/>
        <p className="mt-10" data-zoom-count>쪽지 확인 클릭: {zoomCount}</p>
      </section>
      <section data-slot-fixture="list" className="rounded-3xl bg-white p-5"><h2 className="font-bold">목록 2D</h2><div className="mx-auto max-w-xs"><JarCustomDesignVisual key={kind} design={design}/></div></section>
    </div>
    <section data-slot-fixture="finalize"><JarDesignFinalizePanel key={kind} draft={draft} previewUrl={photo} slotDirty={false} slotSaving={false} cutoutDirty={false} cutoutSaving={false}/></section>
  </main></MemoryRouter>;
}
const root=import.meta.hot?.data.root||createRoot(document.getElementById("root"));
if(import.meta.hot)import.meta.hot.data.root=root;
root.render(<Preview/>);
