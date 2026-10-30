import React,{useState} from "react";
import {createRoot} from "react-dom/client";
import axios from "axios";
import apiClient from "../src/api/apiClient";
import JarCustomDesignVisual from "../src/features/jarDetail/components/JarCustomDesignVisual";
import {basicBodyOutline} from "../src/features/jarDesign/customJarBody.mjs";
import "../src/index.css";

// 실제 컴포넌트와 WebGL을 검사하되 API는 이 어댑터 안에서 끝낸다. 운영 사진·계정·속도 측정에는 사용하지 않는다.
if(!import.meta.env.DEV||!["localhost","127.0.0.1"].includes(location.hostname))throw new Error("Local test only");
const originalCreate=URL.createObjectURL.bind(URL),originalRevoke=URL.revokeObjectURL.bind(URL);
const calls=[],pending=[],live=new Set();let mode="success",notify=()=>{};
URL.createObjectURL=blob=>{const url=originalCreate(blob);live.add(url);notify();return url;};
URL.revokeObjectURL=url=>{live.delete(url);originalRevoke(url);notify();};
const canvas=document.createElement("canvas");canvas.width=canvas.height=480;
const context=canvas.getContext("2d");context.fillStyle="#ffdcaf";context.fillRect(0,0,480,480);
context.fillStyle="#285a51";context.font="bold 58px sans-serif";context.fillText("PHOTO",125,225);context.fillText("LOCAL",125,300);
const photo=canvas.toDataURL("image/png"),photoBlob=await new Promise(resolve=>canvas.toBlob(resolve,"image/png"));
const custom=basicBodyOutline("SQUARE","#9fcbb7"),bodyCanvas=document.createElement("canvas");bodyCanvas.width=bodyCanvas.height=480;
const border=bodyCanvas.getContext("2d"),colors=["#ef4444","#f59e0b","#10b981","#3b82f6"];
border.lineWidth=22;border.lineJoin="round";border.lineCap="round";
custom.points.forEach((p,i)=>{const q=custom.points[(i+1)%custom.points.length];border.strokeStyle=colors[i%colors.length];border.beginPath();border.moveTo(p.x*480,p.y*480);border.lineTo(q.x*480,q.y*480);border.stroke();});
custom.artworkUrl=bodyCanvas.toDataURL("image/png");
const bodyBlob=await new Promise(resolve=>bodyCanvas.toBlob(resolve,"image/png"));
apiClient.defaults.adapter=config=>new Promise((resolve,reject)=>{
  if(!/^\/api\/v1\/jars\/112\/design\/texture\?part=(IMAGE|BODY)$/.test(config.url)){reject(new Error("Unexpected fixture request"));return;}
  const entry={part:config.url.endsWith("IMAGE")?"IMAGE":"BODY",outcome:"pending"};calls.push(entry);notify();
  let finished=false;
  const abort=()=>{if(finished)return;finished=true;entry.outcome="cancelled";reject(new axios.CanceledError());notify();};
  if(config.signal?.aborted){abort();return;}
  config.signal?.addEventListener("abort",abort,{once:true});
  const complete=()=>{
    if(finished)return;finished=true;config.signal?.removeEventListener("abort",abort);
    if(mode==="forbidden"){
      entry.outcome="403";reject(new axios.AxiosError("Fixture denied","ERR_BAD_RESPONSE",config,null,{status:403,data:null,config}));
    }else{
      entry.outcome=mode==="bad-type"?"bad-type":"200";
      resolve({status:200,statusText:"OK",headers:{},config,data:mode==="bad-type"?new Blob(["html"],{type:"text/html"}):entry.part==="IMAGE"?photoBlob:bodyBlob});
    }
    notify();
  };
  if(mode==="delayed")pending.push(complete);else complete();
});

/** 실제 저장된 디자인의 prop 전달·권한 실패·요청 취소를 합성 PNG로 확인하는 개발 전용 화면이다. */
function Fixture(){
  const [scenario,setScenario]=useState("success"),[generation,setGeneration]=useState(0),[,refresh]=useState(0);
  notify=()=>queueMicrotask(()=>refresh(n=>n+1));
  const design={bodyStyle:"CUSTOM",customBody:custom,bodyArtworkUrl:custom.artworkUrl,imageUrl:photo,
    imageTextureUrl:"/api/v1/jars/112/design/texture?part=IMAGE",bodyArtworkTextureUrl:"/api/v1/jars/112/design/texture?part=BODY",
    slotCenterX:.5,slotCenterY:.5,slotSizeRatio:.18,slotStyle:"CAPSULE"};
  return <main style={{padding:16,maxWidth:900,margin:"auto"}}>
    <h1>과거 사진 읽기 호환 · 로컬 기능 검증</h1><p>dd6e50b 계산 유지 · 실제 운영 요청 없음 · 성능 수치 아님</p>
    <label>시험 상황 <select aria-label="시험 상황" value={scenario} onChange={e=>{mode=e.target.value;setScenario(mode);setGeneration(n=>n+1);}}>
      <option value="success">정상 사진·테두리</option><option value="forbidden">권한 없음 403</option><option value="bad-type">잘못된 이미지 타입</option><option value="delayed">응답 대기·2D 취소</option>
    </select></label>
    <button onClick={()=>{const list=pending.splice(0);for(const resolve of list)resolve();}} style={{marginLeft:16}}>대기 응답 완료</button>
    <div style={{width:380,height:380,maxWidth:"100%",margin:"16px auto",background:"#fff4e9"}}><JarCustomDesignVisual key={generation} design={design} allow3D/></div>
    <pre aria-label="검증 기록" style={{whiteSpace:"pre-wrap"}}>{JSON.stringify({scenario,calls,liveBlobUrls:live.size},null,2)}</pre>
  </main>;
}
createRoot(document.getElementById("root")).render(<Fixture/>);
