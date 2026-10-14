import test from "node:test";
import assert from "node:assert/strict";
import {insetBodyContours, contoursFit, insideContour} from "./bodyContours.mjs";
import {bodyArtworkPixels} from "./bodyArtworkPixels.mjs";
import {customJarBody} from "./customJarBody.mjs";
import {body3DProfile, canExtrudeHollowBody} from "./body3DGeometry.mjs";
import {roundedBodyGeometry} from "./body3DMesh.mjs";

const outer=[{x:.1,y:.1},{x:.9,y:.1},{x:.9,y:.9},{x:.65,y:.9},
  {x:.65,y:.3},{x:.35,y:.3},{x:.35,y:.9},{x:.1,y:.9}];
test("깊은 오목한 모양도 사각형 대체 없이 2D와 3D에서 같은 사진 경계를 사용한다",()=>{
  const snapshot=structuredClone(outer), contours=insetBodyContours(outer);
  assert.ok(contoursFit(outer,contours)); assert.ok(contours[0].length>4);
  const value={points:outer,color:"#abcdef",photoContours:contours};
  const body=customJarBody(value),profile=body3DProfile(value);
  assert.deepEqual(body.photoContours,profile.photoContours);
  assert.equal(profile.photoMode,"CONTOURS");assert.ok(canExtrudeHollowBody(profile));
  assert.ok(!contours.some(c=>insideContour({x:.5,y:.65},c)));
  assert.deepEqual(outer,snapshot);
});
test("가느다란 연결부는 테두리로 남기고 두 사진 공간을 실제 구멍으로 만든다",()=>{
  const points=[{x:.1,y:.2},{x:.4,y:.2},{x:.4,y:.49},{x:.6,y:.49},{x:.6,y:.2},
    {x:.9,y:.2},{x:.9,y:.8},{x:.6,y:.8},{x:.6,y:.51},{x:.4,y:.51},{x:.4,y:.8},{x:.1,y:.8}];
  const photoContours=insetBodyContours(points);
  assert.equal(photoContours.length,2);assert.ok(contoursFit(points,photoContours));
  const value={points,color:"#abcdef",photoContours}, profile=body3DProfile(value);
  assert.deepEqual(customJarBody(value).photoContours,profile.photoContours);
  assert.ok(canExtrudeHollowBody(profile));
  const mesh=roundedBodyGeometry(value,true,profile);
  assert.ok([...mesh.attributes.position.array].every(Number.isFinite));mesh.dispose();
});
test("사진 경계가 외곽을 벗어나거나 교차/중첩/과도한 개수이면 거절한다",()=>{
  const square=[{x:.1,y:.1},{x:.9,y:.1},{x:.9,y:.9},{x:.1,y:.9}];
  const inner=[{x:.2,y:.2},{x:.8,y:.2},{x:.8,y:.8},{x:.2,y:.8}];
  assert.ok(contoursFit(square,[inner]));
  for(const bad of [[square],[inner,inner],Array(9).fill(inner),[[null,...inner]],
    [[inner[0],inner[2],inner[1],inner[3]]]]) assert.equal(contoursFit(square,bad),false);
});
test("여러 색의 RGB와 원본 픽셀은 보존하고 투명한 곡면만 가까운 색으로 잇는다",()=>{
  const data=new Uint8ClampedArray(480*480*4);
  data.set([239,68,68,255],(120*480+120)*4);
  data.set([56,189,248,255],(360*480+360)*4);
  const snapshot=data.slice(),output=bodyArtworkPixels({width:480,height:480,data});
  assert.deepEqual(data,snapshot);
  assert.deepEqual([...output.slice((120*480+120)*4,(120*480+120)*4+4)],[239,68,68,255]);
  assert.deepEqual([...output.slice((360*480+360)*4,(360*480+360)*4+4)],[56,189,248,255]);
  assert.deepEqual([...output.slice(0,4)],[239,68,68,255]);
  assert.deepEqual([...output.slice(-4)],[56,189,248,255]);
  assert.throws(()=>bodyArtworkPixels({width:480,height:480,data:new Uint8ClampedArray(data.length)}));
  assert.throws(()=>bodyArtworkPixels({width:1,height:1,data:new Uint8ClampedArray(4)}));
});
