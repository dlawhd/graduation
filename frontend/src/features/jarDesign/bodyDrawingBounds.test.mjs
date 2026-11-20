import test from "node:test";
import assert from "node:assert/strict";
import { bodyRasterBounds } from "./bodyDrawingBounds.mjs";
import { outlineError } from "./customJarBody.mjs";
import { contoursFit, insetBodyContours } from "./bodyContours.mjs";
import { paintedBodyOutline } from "./bodyPainting.mjs";

const square = (min, max) => [{ x:min,y:min },{ x:max,y:min },{ x:max,y:max },{ x:min,y:max }];
test("480px 그림판의 1% 여백은 안쪽 정수 경계 5~475px다", () => {
  assert.deepEqual(bodyRasterBounds(480), { left:5, top:5, right:475, bottom:475 });
  assert.deepEqual(bodyRasterBounds(100,200), { left:1, top:2, right:99, bottom:198 });
});
test("1% 경계는 허용하고 그 바깥의 틀은 거절한다", () => {
  assert.equal(outlineError({ points:square(.01,.99), color:"#abcdef" }), "");
  assert.ok(outlineError({ points:square(.009,.99), color:"#abcdef" }));
  assert.ok(outlineError({ points:square(.01,.991), color:"#abcdef" }));
  assert.equal(outlineError({ points:square(.05,.95), color:"#abcdef" }), "");
});
test("기존 5% 영역 밖의 새 그림도 외곽선과 사진 창으로 변환한다", () => {
  const width=480,height=480,data=new Uint8ClampedArray(width*height*4);
  for(let y=5;y<475;y++) for(let x=5;x<475;x++) data.set([0,120,80,255],(y*width+x)*4);
  const result=paintedBodyOutline({width,height,data});
  assert.equal(result.error, "");
  assert.ok(Math.min(...result.value.points.map(p=>p.x)) < .05);
  assert.equal(outlineError(result.value), "");
  const contours=insetBodyContours(result.value.points);
  assert.ok(contours.length);
  assert.ok(contoursFit(result.value.points,contours));
  assert.ok(contours[0].some(p=>p.x < .05));
});
