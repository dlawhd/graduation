import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { roundedBodyGeometry } from "../src/features/jarDesign/body3DMesh.mjs";
import { body3DProfile } from "../src/features/jarDesign/body3DGeometry.mjs";
import { createBody3DTiming } from "../src/features/jarDesign/body3DTiming.mjs";
import { body3DRegressionCases, body3DGeometrySignature } from "./fixtures/body3DRegression.mjs";
import { getJarBody } from "../src/features/jarDesign/jarBodies.mjs";
import { preparedBodyProfile } from "../src/features/jarDesign/preparedBody3D.mjs";

// Git의 고정 기준본을 메모리에서만 불러온다. 작업 파일·운영 서비스·의존성을 수정하지 않는다.
const baselineRef=process.argv[2]||"504f3b6";
if(!/^[0-9a-f]{7,40}$/.test(baselineRef))throw new Error("기준 커밋 해시를 입력해 주세요.");
let baselineSource=execFileSync("git",["show",`${baselineRef}:frontend/src/features/jarDesign/body3DMesh.mjs`],{encoding:"utf8"});
let baselineBase=execFileSync("git",["show",`${baselineRef}:frontend/src/features/jarDesign/body3DBase.mjs`],{encoding:"utf8"});
const hash=source=>createHash("sha256").update(source).digest("hex");
const sourceHashes={before:hash(baselineSource),after:hash(readFileSync(new URL("../src/features/jarDesign/body3DMesh.mjs",import.meta.url))),
  baseBefore:hash(baselineBase),baseAfter:hash(readFileSync(new URL("../src/features/jarDesign/body3DBase.mjs",import.meta.url)))};
// 바닥도 변경할 때 기준 mesh가 현재 바닥을 잘못 사용하면 개선율이 왜곡된다. 기준 바닥 역시 Git 원본을 읽는다.
baselineBase=baselineBase.replace('from "three"',`from ${JSON.stringify(import.meta.resolve("three"))}`);
const baselineBaseUrl=`data:text/javascript;base64,${Buffer.from(baselineBase).toString("base64")}`;
baselineSource=baselineSource.replace('from "three"',`from ${JSON.stringify(import.meta.resolve("three"))}`)
  .replace('from "./body3DBase.mjs"',`from ${JSON.stringify(baselineBaseUrl)}`)
  .replace('from "./body3DGeometry.mjs"',`from ${JSON.stringify(new URL("../src/features/jarDesign/body3DGeometry.mjs",import.meta.url).href)}`);
const {roundedBodyGeometry:beforeGeometry}=await import(`data:text/javascript;base64,${Buffer.from(baselineSource).toString("base64")}`);
const median=values=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];
const selected=process.argv[3]==="catalog"
  ?JSON.parse(readFileSync(new URL("./fixtures/preparedBodyOutlines.json",import.meta.url),"utf8")).cases.flatMap(item=>{
    const body=getJarBody(item.id);assert.equal(body.path,item.catalogPath,"카탈로그가 고정 입력과 다릅니다.");
    return [false,true].map(hollow=>({id:`${item.id}:${hollow?"hollow":"filled"}`,value:item.value,hollow,profile:preparedBodyProfile(item.value,body)}));})
  :body3DRegressionCases().filter(item=>["IRREGULAR:filled","ROUND:filled","DEEP:filled"].includes(item.id));

/** 속도 구간 바깥에서 모양을 검증한다. GPU·사진 요청 없는 CPU 계산 비교라는 점을 결과에 명시한다. */
function sample(fn,item,profile) {
  const timing=createBody3DTiming({enabled:true});
  const start=performance.now();
  const geometry=timing.measure("bodyGeometry",()=>fn(item.value,item.hollow,profile,timing));
  const durationMs=performance.now()-start;
  try {return {durationMs,signature:body3DGeometrySignature(geometry),spans:timing.finish().spans};}
  finally {geometry.dispose();}
}

const results=[];
for(const item of selected) {
  const profile=item.profile||body3DProfile(item.value),before=[],after=[];
  // 두 구현 모두 예열한 뒤 실행 순서를 번갈아 CPU 부하·JIT 예열 편향을 줄인다.
  for(let warmup=0;warmup<3;warmup++) {
    const first=sample(beforeGeometry,item,profile),second=sample(roundedBodyGeometry,item,profile);
    assert.deepEqual(first.signature,second.signature);
  }
  for(let pair=0;pair<7;pair++) {
    if(pair%2) {after.push(sample(roundedBodyGeometry,item,profile));before.push(sample(beforeGeometry,item,profile));}
    else {before.push(sample(beforeGeometry,item,profile));after.push(sample(roundedBodyGeometry,item,profile));}
    assert.deepEqual(before[pair].signature,after[pair].signature);
  }
  const beforeMs=median(before.map(result=>result.durationMs)),afterMs=median(after.map(result=>result.durationMs));
  const phase=(runs,name)=>median(runs.map(result=>result.spans.filter(span=>span.name===name).reduce((sum,span)=>sum+span.durationMs,0)));
  results.push({caseId:item.id,beforeMedianMs:beforeMs,afterMedianMs:afterMs,reductionPercent:(1-afterMs/beforeMs)*100,
    photoVerticesBeforeMs:phase(before,"photoSurfaceVertices"),photoVerticesAfterMs:phase(after,"photoSurfaceVertices"),
    rimTessellationBeforeMs:phase(before,"rimTessellation"),rimTessellationAfterMs:phase(after,"rimTessellation"),
    rimVerticesBeforeMs:phase(before,"rimSurfaceVertices"),rimVerticesAfterMs:phase(after,"rimSurfaceVertices"),
    geometryIdentical:true,before,after});
}
console.log(JSON.stringify({version:1,baselineRef,sourceHashes,environment:{node:process.version,platform:process.platform,architecture:process.arch},
  method:"같은 Node 프로세스에서 각 구현 3회 예열 후 순서를 번갈아 7쌍 실행. CPU 모양 계산만 측정하며 이미지 요청·GPU·화면 전환은 제외.",results},null,2));
