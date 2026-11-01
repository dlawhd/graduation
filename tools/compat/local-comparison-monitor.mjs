/** 로컬 비교 빌드에만 붙는 관찰 패널이다. 사진 준비·그리기 반환과 두 번의 rAF 관측을 GPU 완료와 구분한다. */
const variant=document.querySelector('meta[name="comparison-variant"]')?.content;
const commit=document.querySelector('meta[name="comparison-commit"]')?.content;
const workingTree=document.querySelector('meta[name="comparison-working-tree"]')?.content==="true";
if(!/^[a-f0-9]{40}$/.test(commit||""))throw Error("Pinned comparison commit required");
if(!["127.0.0.1","localhost"].includes(location.hostname)||!["before","after"].includes(variant))throw Error("Local comparison only");
const rows=[];let active=null,batching=false,providerBefore=null,providerAfter=null;
const panel=document.createElement("aside");panel.dataset.localComparison="";
panel.style.cssText="position:fixed;right:10px;bottom:10px;z-index:2147483647;width:350px;max-height:45vh;overflow:auto;background:#fff;padding:12px;border:2px solid #267458;border-radius:12px;font:12px sans-serif;color:#183f30;box-shadow:0 2px 14px #0002";
const title=document.createElement("strong");title.textContent=`로컬 전체 버전 비교 · ${variant==="before"?"비교 기준":"현재 구현"} (${commit.slice(0,7)}${workingTree?" 기준 작업 수정본":""})`;
const note=document.createElement("p");note.textContent="합성 사진·380×380. 실제 AWS/운영 속도·GPU 완료 측정이 아닙니다. 두 버전의 모양·사진 표현도 다릅니다.";
const batch=document.createElement("button");batch.textContent="6회 자동 측정";
const save=document.createElement("button");save.textContent="JSON 저장";save.style.marginLeft="8px";
const pre=document.createElement("pre");pre.dataset.localComparisonResults="";pre.style.cssText="white-space:pre-wrap;font-size:11px";
const details=document.createElement("details"),summary=document.createElement("summary");details.append(summary,pre);
panel.append(title,note,batch,save,details);document.body.append(panel);
function report(){return {version:3,variant,commit,workingTree,scope:"LOCAL_HISTORICAL_RELEASE_COMPARISON_WITH_LOCAL_IMAGE_PROVIDER",completion:"renderer-return-and-photo-ready; plus-two-rAF-observation-not-GPU-completion",
  providerReadsDuringBatch:providerBefore!=null&&providerAfter!=null?providerAfter-providerBefore:null,rows:[...rows]};}
function paint(){pre.textContent=JSON.stringify(report(),null,2);summary.textContent=`측정 기록 펼치기 · ${rows.length}건`;}
function finishFailure(code){if(!active)return;clearTimeout(active.timeout);rows.push({ordinal:rows.length+1,status:"failed",code});active=null;paint();}
function ready(run){
  if(active!==run||!run.stage?.isConnected||!run.rendered)return;
  const imgs=[...run.stage.querySelectorAll("img")];
  if(imgs.some(i=>!i.complete||i.naturalWidth===0))return;
  if(run.finishing)return;run.finishing=true;
  const readyMs=performance.now()-run.start;
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
    if(active!==run)return;
    const bounds=run.stage.getBoundingClientRect(),canvas=run.stage.querySelector("canvas");
    const resources=performance.getEntriesByType("resource").filter(e=>e.startTime>=run.start).flatMap(e=>{
      const url=new URL(e.name,location.href);let kind;
      if(url.pathname.includes("/design/texture"))kind="image-api";
      else if(url.pathname==="/test-memory-jar-bucket/compatibility/fixture.png")kind="local-photo";
      else return [];
      return [{kind,durationMs:e.duration,ttfbMs:e.responseStart?e.responseStart-e.requestStart:null}];
    });
    clearTimeout(run.timeout);
    const fullyVisible=bounds.top>=-.5&&bounds.left>=-.5&&bounds.bottom<=document.documentElement.clientHeight+.5&&bounds.right<=document.documentElement.clientWidth+.5;
    rows.push({ordinal:rows.length+1,status:document.hidden?"invalid-hidden-tab":!fullyVisible?"invalid-offscreen":"completed",clickToPhotoAndRenderReadyMs:readyMs,
      clickToTwoRafObservationMs:performance.now()-run.start,viewport:{width:bounds.width,height:bounds.height,devicePixelRatio:devicePixelRatio,
        x:bounds.x,y:bounds.y,fullyVisible,windowWidth:document.documentElement.clientWidth,windowHeight:document.documentElement.clientHeight,
        bufferWidth:canvas?.width,bufferHeight:canvas?.height},triangles:run.triangles,resources});
    active=null;paint();
  }));
}
globalThis.__memoryJarComparison={
  /** 실제 컴포넌트의 그리기 반환 뒤에만 호출한다. 처음의 빈 몸통은 완료로 세지 않는다. */
  frame(stage,texturesReady,triangles){
    const run=active;if(!run||!texturesReady)return;run.stage=stage;run.rendered=true;run.triangles=triangles;
    for(const image of stage.querySelectorAll("img"))if(!image.complete){image.addEventListener("load",()=>ready(run),{once:true});image.addEventListener("error",()=>finishFailure("photo-load"),{once:true});}
    ready(run);
  },
  fail(){finishFailure("viewer-failure");}
};
document.addEventListener("click",event=>{
  const button=event.target.closest("button");if(!button||panel.contains(button))return;
  const text=button.textContent.trim();
  if(text==="3D로 보기"){
    if(active)finishFailure("overlapping-transition");
    active={start:performance.now(),rendered:false,finishing:false};active.timeout=setTimeout(()=>finishFailure("timeout"),20000);
  }else if(text==="2D로 보기"&&active)finishFailure("returned-to-2d-before-completion");
},true);
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
/** 사용자 버튼으로 시작한다. 숨겨진 탭·실패·중복 실행에서 수치를 조용히 계속 만들지 않는다. */
batch.onclick=async()=>{
  if(batching||active)return;batching=true;batch.disabled=true;
  try{
    if(document.hidden)throw Error("active-tab-required");
    const photo=[...document.querySelectorAll('[data-custom-body-viewer] img')];
    if(photo.some(i=>!i.complete||i.naturalWidth===0))throw Error("wait-for-2d-photo");
    document.querySelector('[data-custom-body-viewer]')?.scrollIntoView({block:"center",inline:"nearest",behavior:"instant"});
    await pause(400);
    providerBefore=(await(await fetch("/__comparison/provider-stats")).json()).imageReads;providerAfter=null;
    for(let i=0;i<6;i++){
      if(document.hidden)throw Error("active-tab-required");
      const toggle=[...document.querySelectorAll("button")].find(b=>b.textContent.trim()==="3D로 보기");
      if(!toggle)throw Error("start-from-2d");
      const count=rows.length;toggle.click();
      while(active)await pause(40);
      if(rows.length!==count+1||rows.at(-1).status!=="completed")throw Error("transition-failed");
      const back=[...document.querySelectorAll("button")].find(b=>b.textContent.trim()==="2D로 보기");
      if(!back)throw Error("2d-control-missing");back.click();await pause(350);
    }
    providerAfter=(await(await fetch("/__comparison/provider-stats")).json()).imageReads;
  }catch(error){note.textContent=`측정 중단: ${error.message}. 준비 상태를 확인하고 다시 실행하세요.`;}
  finally{batching=false;batch.disabled=false;paint();}
};
save.onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(report(),null,2)],{type:"application/json"}));const a=document.createElement("a");a.href=url;a.download=`local-${variant}-${Date.now()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
paint();
