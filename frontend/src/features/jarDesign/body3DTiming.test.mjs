import test from "node:test";
import assert from "node:assert/strict";
import { createBody3DTiming,localBody3DTimingEnabled,body3DTimingReport } from "./body3DTiming.mjs";
import { readFileSync } from "node:fs";
import { basicBodyOutline, customJarBody } from "./customJarBody.mjs";
import { roundedBodyGeometry } from "./body3DMesh.mjs";
import { body3DProfile } from "./body3DGeometry.mjs";
import { IRREGULAR_BODY_OUTLINE } from "../../../tests/fixtures/irregularBodyOutline.mjs";

test("기본 비활성화에서는 시계나 사용자 정보에 접근하지 않는다",()=>{
  assert.equal(createBody3DTiming({now:()=>{throw new Error("clock must not run");}}),null);
});

test("구간별 시작/종료와 클릭 기준 누적 시간을 구분한다",()=>{
  let time=100;
  const trace=createBody3DTiming({enabled:true,now:()=>time});
  time=120;trace.mark("componentRender");
  const end=trace.start("bodyGeometry");
  time=180;end();end();
  time=200;trace.mark("texturesReady");
  time=210;const result=trace.finish();
  assert.deepEqual(result.marks,{componentRender:20,texturesReady:100,texturedRenderEnd:110});
  assert.deepEqual(result.spans,[{name:"bodyGeometry",startMs:20,endMs:80,durationMs:60}]);
  assert.equal(trace.finish(),null);
});

test("중첩 구간은 별도로 남기고 완료 지점은 처음 한 번만 기록한다",()=>{
  let time=0;const trace=createBody3DTiming({enabled:true,now:()=>time});
  const outer=trace.start("photoCanvasAndTexture");
  time=5;const inner=trace.start("imageOnlyGeometry");
  time=15;inner();
  time=20;outer();trace.mark("texturesReady");
  time=25;trace.mark("texturesReady");
  const result=trace.finish();
  assert.equal(result.marks.texturesReady,20);
  assert.deepEqual(result.spans.map(s=>s.durationMs),[10,20]);
});

test("예외를 삼키지 않으면서 실패한 계산의 시간도 종료한다",()=>{
  let time=0;const trace=createBody3DTiming({enabled:true,now:()=>time});
  assert.throws(()=>trace.measure("geometry",()=>{time=7;throw new Error("invalid outline");}),/invalid outline/);
  assert.equal(trace.finish().spans[0].durationMs,7);
});

test("취소한 측정에는 늦게 도착한 이미지 결과를 남기지 않는다",()=>{
  let time=0;const trace=createBody3DTiming({enabled:true,now:()=>time});
  const end=trace.start("photoSource");trace.cancel();time=200;end();
  assert.equal(trace.finish(),null);
});

test("반복 전환은 독립 시계를 사용하고 완료 결과는 이후 조작에 변하지 않는다",()=>{
  let time=0;const first=createBody3DTiming({enabled:true,now:()=>time});
  time=10;const snapshot=first.finish();time=100;first.mark("later");
  const second=createBody3DTiming({enabled:true,now:()=>time});
  time=120;assert.equal(second.finish().marks.texturedRenderEnd,20);
  assert.deepEqual(snapshot.marks,{texturedRenderEnd:10});
});

test("계측 유무가 실제 표면의 좌표·삼각형·재질 그룹을 바꾸지 않는다",()=>{
  const value=basicBodyOutline("JAR"),profile=body3DProfile(value);
  const plain=roundedBodyGeometry(value,false,profile),trace=createBody3DTiming({enabled:true});
  const measured=roundedBodyGeometry(value,false,profile,trace);
  try {
    assert.deepEqual(measured.index.array,plain.index.array);
    assert.deepEqual(measured.attributes.position.array,plain.attributes.position.array);
    assert.deepEqual(measured.groups,plain.groups);
    assert.ok(trace.finish().spans.some(span=>span.name==="photoTessellation"));
  } finally {plain.dispose();measured.dispose();}
});

test("진단 진입은 개발 전용 경로로 제한하고 렌더러에서도 운영 계측을 차단한다",()=>{
  const viewer=readFileSync(new URL("./components/CustomJarBodyViewer.jsx",import.meta.url),"utf8");
  const renderer=readFileSync(new URL("./components/CustomJarBody3D.jsx",import.meta.url),"utf8");
  assert.ok(viewer.includes('import.meta.env.DEV && window.location.pathname==="/tests/jar-3d-timing.html"'));
  assert.ok(renderer.includes('const timing=import.meta.env.DEV?devTiming:null;'));
});

test("화면에서 읽은 불규칙 외곽은 정상 검증을 통과하고 기본 사진 창을 유지한다",()=>{
  const body=customJarBody(IRREGULAR_BODY_OUTLINE);
  assert.ok(body);assert.equal(body.naturalPhoto,false);
  assert.equal(IRREGULAR_BODY_OUTLINE.points.length,53);
});

test("실제 사진 진단은 로컬 개발과 지정 화면의 명시적 단일 인수에서만 켜진다",()=>{
  const allowed={development:true,hostname:"localhost",pathname:"/jars/2",search:"?diagnose3d=1"};
  assert.equal(localBody3DTimingEnabled(allowed),true);
  for(const pathname of ["/jars/new","/jars/design/new"])assert.equal(localBody3DTimingEnabled({...allowed,pathname}),true);
  for(const override of [{development:false},{hostname:"www.esjh.shop"},{hostname:"localhost.example"},
    {pathname:"/jars"},{pathname:"/jars/0"},{search:""},{search:"?diagnose3d=0"},{search:"?diagnose3d=1&diagnose3d=1"}]) {
    assert.equal(localBody3DTimingEnabled({...allowed,...override}),false);
  }
});

test("실제 화면 결과는 숫자 허용 목록만 남기고 입력 URL·개인정보·임의 라벨을 버린다",()=>{
  const result=body3DTimingReport({status:"complete",marks:{texturedRenderEnd:120,componentRender:10,private:"secret"},
    spans:[{name:"bodyGeometry",durationMs:50},{name:"private-url",durationMs:9}],
    viewport:{width:420,height:420,pixelRatio:1.25,url:"secret"},triangles:100,userId:77,imageUrl:"private-image"});
  assert.equal(result.timingsMs.clickToRenderReturn,120);assert.equal(result.timingsMs.bodyGeometry,50);
  assert.equal(result.timingsMs.photoSource,null);
  assert.doesNotMatch(JSON.stringify(result),/secret|private|imageUrl|userId/);
  assert.equal(body3DTimingReport({status:"complete",marks:{texturedRenderEnd:NaN}}),null);
  assert.equal(body3DTimingReport({status:"failed",marks:{texturedRenderEnd:1}}),null);
});

test("재실행으로 폐기한 계산과 출력에 사용한 계산을 같은 클릭에서 분리한다",()=>{
  let time=0;const trace=createBody3DTiming({enabled:true,now:()=>time});
  trace.measure("profile",()=>{time=2;});
  trace.measure("profile",()=>{time=4;});
  const first=trace.beginEffect(),firstSetup=first.start("effectSetup");
  first.measure("bodyGeometry",()=>{time=34;});time=39;firstSetup();
  first.mark("texturesReady");
  const stale=first.start("photoSource");
  first.measure("effectCleanup",()=>{time=44;});first.dispose();
  assert.equal(first.finish(),null);
  const second=trace.beginEffect(),secondSetup=second.start("effectSetup");
  second.measure("bodyGeometry",()=>{time=64;});
  second.measure("rendererInit",()=>{time=69;});time=74;secondSetup();
  time=80;stale();first.mark("invalidLateMark");
  time=90;second.mark("texturesReady");
  time=100;const result=second.finish(),report=body3DTimingReport(result);
  assert.equal(result.marks.invalidLateMark,undefined);
  assert.equal(result.marks.texturesReady,90);
  assert.equal(report.timingsMs.clickToRenderReturn,100);
  assert.equal(report.timingsMs.bodyGeometry,50);
  assert.equal(report.timingsMs.photoSource,null);
  assert.equal(report.effectBreakdown.observedEffectCount,2);
  assert.equal(report.effectBreakdown.discardedEffectCount,1);
  assert.equal(report.effectBreakdown.renderedEffect.bodyGeometryMs,20);
  assert.equal(report.effectBreakdown.renderedEffect.setupMs,30);
  assert.equal(report.effectBreakdown.discardedEffects.bodyGeometryMs,30);
  assert.equal(report.effectBreakdown.discardedEffects.setupMs,35);
  assert.equal(report.effectBreakdown.discardedEffects.cleanupMs,5);
  assert.deepEqual(report.effectBreakdown.profileComputations,{count:2,totalMs:4});
  assert.equal(second.finish(),null);
  assert.deepEqual(result.effects.map(item=>item.status),["discarded","rendered"]);
});

test("한 번 준비한 화면은 폐기 비용을 0으로 만들지 않고 미측정으로 구분한다",()=>{
  let time=0;const trace=createBody3DTiming({enabled:true,now:()=>time}),effect=trace.beginEffect();
  effect.measure("bodyGeometry",()=>{time=10;});time=20;
  const report=body3DTimingReport(effect.finish());
  assert.equal(report.effectBreakdown.observedEffectCount,1);
  assert.equal(report.effectBreakdown.discardedEffectCount,0);
  assert.equal(report.effectBreakdown.discardedEffects.bodyGeometryMs,null);
  assert.equal(report.effectBreakdown.renderedEffect.bodyGeometryMs,10);
});

test("클릭 취소는 모든 효과를 닫고 늦은 결과나 새 효과를 만들지 않는다",()=>{
  let time=0;const trace=createBody3DTiming({enabled:true,now:()=>time}),effect=trace.beginEffect();
  const finish=effect.start("bodyGeometry");trace.cancel();time=100;finish();
  assert.equal(effect.finish(),null);assert.equal(trace.finish(),null);assert.equal(trace.beginEffect(),null);
});

test("효과 구간과 요약은 임의 사용자 필드를 버리고 중복 ID나 모호한 완료를 거절한다",()=>{
  const result={status:"complete",marks:{texturedRenderEnd:100},
    effects:[{id:1,status:"discarded",private:"secret"},{id:2,status:"rendered",url:"private"}],
    spans:[{effectId:1,name:"bodyGeometry",durationMs:30},{effectId:2,name:"bodyGeometry",durationMs:20},
      {effectId:2,name:"photoTessellation",durationMs:7},{effectId:2,name:"photoHeightField",durationMs:3},
      {effectId:2,name:"photoSurfaceVertices",durationMs:5},{effectId:999,name:"bodyGeometry",durationMs:999}]};
  const report=body3DTimingReport(result);
  assert.equal(report.effectBreakdown.renderedEffect.bodyGeometryMs,20);
  assert.equal(report.effectBreakdown.renderedEffect.geometryStagesMs.photoTessellation,7);
  assert.doesNotMatch(JSON.stringify(report),/secret|private|url/);
  assert.equal(body3DTimingReport({...result,effects:[{id:1,status:"discarded"},{id:1,status:"rendered"}]}).effectBreakdown,null);
  assert.equal(body3DTimingReport({...result,effects:[{id:1,status:"rendered"},{id:2,status:"rendered"}]}).effectBreakdown,null);
  assert.equal(body3DTimingReport({...result,effects:undefined}).effectBreakdown,null);
});
