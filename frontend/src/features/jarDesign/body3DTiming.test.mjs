import test from "node:test";
import assert from "node:assert/strict";
import { createBody3DTiming } from "./body3DTiming.mjs";
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
