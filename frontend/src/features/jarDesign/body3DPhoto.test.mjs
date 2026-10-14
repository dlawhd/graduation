import test from "node:test";
import assert from "node:assert/strict";
import {body3DPhotoLayout,drawBody3DPhoto} from "./body3DPhoto.mjs";
import {body3DProfile,BODY_3D_DEPTH,BODY_3D_PHOTO_BULGE} from "./body3DGeometry.mjs";
import {roundedBodyGeometry} from "./body3DMesh.mjs";
import {basicBodyOutline} from "./customJarBody.mjs";
import {coverPhotoFrame,containPhotoFrame} from "./photoFraming.mjs";

test("곡면 텍스처도 저장한 확대/이동/전체 보기 배치를 변경하지 않는다",()=>{
  for(const kind of ["ROUND","JAR","SQUARE"]) {
    const profile=body3DProfile(basicBodyOutline(kind)),w=profile.window;
    for(const frame of [null,coverPhotoFrame(w,undefined,2,1,0),containPhotoFrame({x:0,y:.2,width:1,height:.6})]) {
      const snapshot=structuredClone([profile,frame]),layout=body3DPhotoLayout(profile,frame);
      assert.ok(Object.values(layout.clip).every(Number.isFinite));assert.ok(layout.clip.width>0);
      if(frame?.fit!=="CONTAIN") {
        assert.deepEqual(layout.clip,{x:w.x,y:w.y,width:w.width,height:w.height});
        if(frame)assert.ok(Math.abs(layout.image.width*frame.width-layout.clip.width)<1e-5);
      } else assert.ok(Math.abs(layout.image.width/layout.image.height-1)<1e-6);
      assert.deepEqual([profile,frame],snapshot);
    }
  }
});
test("사진은 두 재질 그룹의 곡면이고 앞뒤 UV는 같아 회전 자체로 반전된다",()=>{
  const value=basicBodyOutline("ROUND"),snapshot=structuredClone(value),geometry=roundedBodyGeometry(value);
  const p=geometry.attributes.position,uv=geometry.attributes.uv;
  assert.equal(geometry.groups[1].materialIndex,1);
  for(let i=0;i<p.count;i++) {
    assert.ok(Math.abs(uv.getX(i)-(p.getX(i)+1)/2)<1e-6);
    assert.ok(Math.abs(uv.getY(i)-(p.getY(i)+1)/2)<1e-6);
  }
  assert.equal(geometry.userData.photoHeight({x:.532,y:-.04}),BODY_3D_DEPTH/2);
  const middle=geometry.userData.photoHeight({x:0,y:-.04});
  assert.ok(middle>BODY_3D_DEPTH/2+.1&&middle<=BODY_3D_DEPTH/2+BODY_3D_PHOTO_BULGE);
  assert.deepEqual(value,snapshot);geometry.dispose();
});
test("Canvas에는 배치와 픽셀 보간을 적용하고 이미지 자체는 변경하지 않는다",()=>{
  const calls=[],image={},profile=body3DProfile(basicBodyOutline("ROUND"));
  const context={clearRect(){},fillRect(){},save(){},restore(){},beginPath(){},rect(...args){calls.push(args);},clip(){},drawImage(...args){calls.push(args);}};
  drawBody3DPhoto(context,image,profile,null,true);
  assert.equal(context.imageSmoothingEnabled,false);assert.equal(calls[1][0],image);
  assert.ok(calls[1].slice(1).every(Number.isFinite));assert.deepEqual(image,{});
});
