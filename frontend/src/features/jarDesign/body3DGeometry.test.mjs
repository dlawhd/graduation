import test from "node:test";
import assert from "node:assert/strict";
import { Group, OrthographicCamera, Vector3 } from "three";
import { roundedBodyGeometry } from "./body3DMesh.mjs";
import { basicBodyOutline, customJarBody } from "./customJarBody.mjs";
import { bodyWorldPoint, body3DOutline, body3DProfile, bodyRotation, bodyPhotoSurface, bodyViewExtent, projectedSurfaceMatrix,
  canExtrudeHollowBody, bodyDomeDepth, BODY_3D_DEPTH, BODY_3D_EDGE_DEPTH, BODY_3D_SURFACE, BODY_3D_VIEW, BODY_3D_PHOTO_SCALE } from "./body3DGeometry.mjs";

test("그림판 좌표를 위아래 뒤집힘 없이 3D 좌표로 변환한다",()=>{
  assert.deepEqual(bodyWorldPoint({x:0,y:0}),{x:-1,y:1});
  assert.deepEqual(bodyWorldPoint({x:.5,y:.5}),{x:0,y:0});
  assert.deepEqual(bodyWorldPoint({x:1,y:1}),{x:1,y:-1});
});
test("잘못된 외곽선은 Three.js로 전달하지 않고 원본 좌표도 수정하지 않는다",()=>{
  const outline=basicBodyOutline("JAR"),snapshot=structuredClone(outline);
  assert.equal(body3DOutline({points:[],color:"#ffffff"}),null);
  assert.equal(body3DOutline({...outline,color:"url(example)"}),null);
  assert.equal(body3DOutline({...outline,points:[...outline.points,{x:Infinity,y:.5}]}),null);
  assert.ok(body3DOutline(outline).length>=outline.points.length);
  assert.ok(body3DOutline(outline).length<=outline.points.length*4);
  assert.deepEqual(outline,snapshot);
});
test("양쪽 축의 회전은 한 바퀴 뒤에도 이어지고 비정상 입력은 정면으로 복구한다",()=>{
  assert.deepEqual(bodyRotation(Infinity,NaN),{yaw:0,pitch:0});
  assert.deepEqual(bodyRotation(9,-4),{yaw:9-2*Math.PI,pitch:2*Math.PI-4});
  assert.deepEqual(bodyRotation(-9,4),{yaw:2*Math.PI-9,pitch:4-2*Math.PI});
  assert.deepEqual(bodyRotation(Math.PI*4,-Math.PI*4),{yaw:0,pitch:0});
  assert.deepEqual(bodyRotation(.4,.8),{yaw:.4,pitch:.8});
  for(const angle of [Number.MAX_VALUE,-Number.MAX_VALUE]) {
    const rotation=bodyRotation(angle,angle);
    assert.ok(Object.values(rotation).every(n=>Number.isFinite(n)&&Math.abs(n)<=Math.PI));
  }
});
test("위/아래와 좌/우를 여러 바퀴 돌려도 같은 회전 방향과 자세를 유지한다",()=>{
  for(const sign of [1,-1]) {
    let rotation={yaw:0,pitch:0};
    for(let i=1;i<=200;i++) {
      rotation=bodyRotation(rotation.yaw+sign*.2,rotation.pitch+sign*.12);
      for(const [axis,delta] of [["yaw",.2],["pitch",.12]]) {
        assert.ok(Math.abs(Math.cos(rotation[axis])-Math.cos(sign*i*delta))<1e-10);
        assert.ok(Math.abs(Math.sin(rotation[axis])-Math.sin(sign*i*delta))<1e-10);
      }
    }
  }
});
test("얇은 옆 테두리와 앞뒤 볼륨을 분리해도 사진은 표면 바깥이고 정면 외형 크기는 유지한다",()=>{
  assert.equal(BODY_3D_DEPTH,.30);
  assert.equal(BODY_3D_EDGE_DEPTH,.025);
  assert.ok(BODY_3D_EDGE_DEPTH<BODY_3D_DEPTH*.1);
  assert.ok(BODY_3D_SURFACE>BODY_3D_DEPTH/2+.003);
  for(const kind of ["ROUND","JAR","SQUARE"]) {
    const points=body3DOutline(basicBodyOutline(kind));
    assert.equal(bodyViewExtent(points,0,0),BODY_3D_VIEW);
    assert.equal(bodyViewExtent(points,Math.PI,0),BODY_3D_VIEW);
  }
});
test("테두리 근처는 얇고 사진 자리로 갈수록 앞뒤가 봉긋해진다",()=>{
  assert.equal(bodyDomeDepth(0),BODY_3D_EDGE_DEPTH/2);
  assert.equal(bodyDomeDepth(1),BODY_3D_DEPTH/2);
  assert.ok(bodyDomeDepth(.1)<.05);
  assert.ok(bodyDomeDepth(.5)>BODY_3D_DEPTH*.33);
  let previous=bodyDomeDepth(0);
  for(let i=1;i<=12;i++) { const current=bodyDomeDepth(i/12);assert.ok(current>previous);previous=current; }
  for(const value of [-1,NaN,Infinity]) assert.equal(bodyDomeDepth(value),bodyDomeDepth(0));
  assert.equal(bodyDomeDepth(2),bodyDomeDepth(1));
});
test("3D 곡면만 넓히며 사진 창의 비율/중심과 저장/2D 좌표를 보존한다",()=>{
  const outline=basicBodyOutline("ROUND"),snapshot=structuredClone(outline),body=customJarBody(outline),profile=body3DProfile(outline);
  assert.equal(body3DProfile({points:[],color:"#ffffff"}),null);
  assert.equal(profile.window.width,body.window.width*BODY_3D_PHOTO_SCALE);
  assert.equal(profile.window.height,body.window.height*BODY_3D_PHOTO_SCALE);
  assert.equal(profile.window.x+profile.window.width/2,body.window.x+body.window.width/2);
  assert.equal(profile.window.y+profile.window.height/2,body.window.y+body.window.height/2);
  assert.equal(profile.photoSafe,true);
  assert.equal(profile.photoMode,"OUTLINE");
  assert.equal(canExtrudeHollowBody(profile),true);
  assert.deepEqual(customJarBody(outline),body);assert.deepEqual(outline,snapshot);
});
test("가장 넓은 틀도 회전과 기울기에서 사진/옆면이 카메라 밖으로 잘리지 않는다",()=>{
  const points=body3DOutline({color:"#123456",points:[{x:.05,y:.05},{x:.95,y:.05},{x:.95,y:.95},{x:.05,y:.95}]});
  const snapshot=structuredClone(points),group=new Group();
  for(const aspect of [.75,1,1.5]) for(let i=0;i<=24;i++) for(let j=0;j<=24;j++) {
    const pitch=-Math.PI+j*Math.PI/12;
    const yaw=-Math.PI+i*Math.PI/12,view=bodyViewExtent(points,yaw,pitch,aspect);
    const camera=new OrthographicCamera(-view*aspect,view*aspect,view,-view,.1,20);
    camera.position.set(0,0,5);camera.updateMatrixWorld(true);
    group.rotation.set(pitch,yaw,0);group.updateMatrixWorld(true);
    for(const p of points) for(const z of [-BODY_3D_SURFACE,BODY_3D_SURFACE]) {
      const projected=group.localToWorld(new Vector3(p.x,p.y,z)).project(camera);
      assert.ok(Math.abs(projected.x)<1);assert.ok(Math.abs(projected.y)<1);
    }
  }
  assert.deepEqual(points,snapshot);
  assert.equal(bodyViewExtent(points,0,0,NaN),BODY_3D_VIEW);
});
test("앞뒤 사진은 각각 바깥 표면에 놓고 옆면에서는 가느다란 사진 띠를 숨긴다",()=>{
  assert.deepEqual(bodyPhotoSurface(0,0),{side:"front",depth:BODY_3D_SURFACE,visible:true});
  for(const yaw of [Math.PI,-Math.PI]) {
    assert.deepEqual(bodyPhotoSurface(yaw,0),{side:"back",depth:-BODY_3D_SURFACE,visible:true});
  }
  for(const yaw of [Math.PI/2,-Math.PI/2]) assert.equal(bodyPhotoSurface(yaw,.55).visible,false);
  for(const pitch of [Math.PI,-Math.PI]) assert.deepEqual(bodyPhotoSurface(0,pitch),{side:"back",depth:-BODY_3D_SURFACE,visible:true});
  for(const pitch of [Math.PI/2,-Math.PI/2]) assert.equal(bodyPhotoSurface(0,pitch).visible,false);
  assert.deepEqual(bodyPhotoSurface(0,2*Math.PI),bodyPhotoSurface(0,0));
  assert.deepEqual(bodyPhotoSurface(Infinity,NaN),bodyPhotoSurface(0,0));
});
test("실제 Three 카메라 투영은 좌우 뒷면 반전과 위아래 뒤집힌 자세를 사진에도 반영한다",()=>{
  const camera=new OrthographicCamera(-BODY_3D_VIEW,BODY_3D_VIEW,BODY_3D_VIEW,-BODY_3D_VIEW,.1,20);
  camera.position.set(0,0,5);camera.updateMatrixWorld(true);
  const group=new Group();
  const projectMatrix=(yaw,pitch) => {
    group.rotation.set(pitch,yaw,0);group.updateMatrixWorld(true);
    const surface=bodyPhotoSurface(yaw,pitch);
    const project=(x,y) => {
      const p=group.localToWorld(new Vector3(x,y,surface.depth)).project(camera);
      return {x:(p.x+1)*240,y:(1-p.y)*240};
    };
    return projectedSurfaceMatrix(project(-1,1),project(1,1),project(-1,-1));
  };
  const front=projectMatrix(0,0),rear=projectMatrix(Math.PI,0);
  const map=(m,x,y)=>({x:m[0]*x+m[2]*y+m[4],y:m[1]*x+m[3]*y+m[5]});
  // 비대칭 얼굴/배경/글자도 같은 좌표를 쓰고 반전을 두 번 적용하지 않는다.
  const photoPoints=[{x:35,y:90},{x:330,y:275},{x:215,y:430}],snapshot=structuredClone(photoPoints);
  for(const p of photoPoints) {
    const a=map(front,p.x,p.y),b=map(rear,p.x,p.y);
    assert.ok(Math.abs(a.x+b.x-480)<1e-8);
    assert.ok(Math.abs(a.y-b.y)<1e-8);
  }
  for(const yaw of [0,.35,Math.PI,-Math.PI,2.6,-2.6]) {
    for(const pitch of [-2*Math.PI,-Math.PI,-2,-.55,0,.55,2,Math.PI,2*Math.PI]) {
      const m=projectMatrix(yaw,pitch);
      const determinant=m[0]*m[3]-m[1]*m[2];
      assert.equal(determinant<0,bodyPhotoSurface(yaw,pitch).side==="back");
      assert.equal(m[3]>0,Math.cos(pitch)>0);assert.ok(m.every(Number.isFinite));
    }
  }
  assert.deepEqual(photoPoints,snapshot);
});
test("DOM 사진과 입구의 투영은 3D의 세 기준점에 정확히 맞는다",()=>{
  const a={x:60,y:45},b={x:340,y:25},c={x:80,y:325};
  const [xx,xy,yx,yy,tx,ty]=projectedSurfaceMatrix(a,b,c);
  const map=(x,y)=>({x:xx*x+yx*y+tx,y:xy*x+yy*y+ty});
  assert.deepEqual(map(0,0),a);assert.deepEqual(map(480,0),b);assert.deepEqual(map(0,480),c);
  assert.equal(projectedSurfaceMatrix(a,b,{x:NaN,y:0}),null);
});
for(const kind of ["ROUND","JAR","SQUARE"]) {
  test(`${kind} 기본 틀의 실제 입체 앞뒤 두께와 빈 구멍`,()=>{
    const outline=basicBodyOutline(kind),body=customJarBody(outline);
    assert.equal(canExtrudeHollowBody(body),true);
    const geometry=roundedBodyGeometry(outline,true);
    assert.ok(Math.abs(geometry.boundingBox.max.z-geometry.boundingBox.min.z-BODY_3D_DEPTH)<1e-6);
    assert.ok([...geometry.attributes.position.array].every(Number.isFinite));
    // 정면 삼각형은 구멍 가운데를 덮지 않는다. 외형/구멍이 모두 삼각분할에 반영되는지 검증한다.
    const pos=geometry.attributes.position,index=geometry.index;
    for(let i=0;i<index.count;i+=3) {
      const [a,b,c]=[index.getX(i),index.getX(i+1),index.getX(i+2)];
      const x=(pos.getX(a)+pos.getX(b)+pos.getX(c))/3;
      const y=(pos.getY(a)+pos.getY(b)+pos.getY(c))/3;
      assert.ok(Math.hypot(x,y)>.15);
    }
    geometry.dispose();
  });
}
test("축소하면 외곽을 벗어나는 깊은 오목한 틀도 안쪽 경계를 따라 빈 공간을 만든다",()=>{
  const outline={color:"#123456",points:[{x:.1,y:.1},{x:.9,y:.1},{x:.9,y:.9},{x:.65,y:.9},
    {x:.65,y:.3},{x:.35,y:.3},{x:.35,y:.9},{x:.1,y:.9}]};
  assert.ok(customJarBody(outline));assert.equal(canExtrudeHollowBody(customJarBody(outline)),true);
  assert.ok(customJarBody(outline).photoOutline.length>4);
});
