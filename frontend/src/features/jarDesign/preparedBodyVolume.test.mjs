import test from "node:test";
import assert from "node:assert/strict";
import {basicBodyOutline} from "./customJarBody.mjs";
import {roundedBodyGeometry} from "./body3DMesh.mjs";
import {body3DOutline,bodyViewExtent,BODY_3D_SURFACE} from "./body3DGeometry.mjs";
import {thickenPreparedBody,PREPARED_BODY_EXTRA_DEPTH} from "./preparedBodyVolume.mjs";

test("준비된 몸통의 앞뒤 면만 벌리고 실루엣·사진 UV·바닥 높이·삼각형은 유지한다",()=>{
  const geometry=roundedBodyGeometry(basicBodyOutline()),position=geometry.attributes.position;
  const before=position.array.slice(),uv=geometry.attributes.uv.array.slice(),index=Array.from(geometry.index.array);
  const minY=geometry.boundingBox.min.y,maxZ=geometry.boundingBox.max.z;
  const oldPhotoHeight=geometry.userData.photoHeight({x:0,y:0});
  thickenPreparedBody(geometry);
  for(let i=0;i<position.count;i++){
    assert.equal(position.getX(i),before[i*3]);assert.equal(position.getY(i),before[i*3+1]);
    assert.ok(Math.abs(position.getZ(i)-before[i*3+2]-Math.sign(before[i*3+2])*PREPARED_BODY_EXTRA_DEPTH/2)<1e-6);
  }
  assert.deepEqual(geometry.attributes.uv.array,uv);assert.deepEqual(Array.from(geometry.index.array),index);
  assert.equal(geometry.boundingBox.min.y,minY);
  assert.ok(Math.abs(geometry.boundingBox.max.z-maxZ-PREPARED_BODY_EXTRA_DEPTH/2)<1e-6);
  assert.equal(geometry.userData.photoHeight({x:0,y:0}),oldPhotoHeight+PREPARED_BODY_EXTRA_DEPTH/2);
  assert.ok([...geometry.attributes.normal.array].every(Number.isFinite));geometry.dispose();
});
test("직접 만든 틀의 기본 깊이와 기존 카메라 기본값은 변경하지 않는다",()=>{
  const value=basicBodyOutline(),geometry=roundedBodyGeometry(value),points=body3DOutline(value);
  assert.ok(geometry.boundingBox.max.z<BODY_3D_SURFACE);
  assert.equal(bodyViewExtent(points,.8,.3),bodyViewExtent(points,.8,.3,1,BODY_3D_SURFACE));
  assert.ok(bodyViewExtent(points,Math.PI/2,0,.3,BODY_3D_SURFACE+.08)>=bodyViewExtent(points,Math.PI/2,0,.3));
  geometry.dispose();
});
