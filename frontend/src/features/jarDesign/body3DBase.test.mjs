import test from "node:test";
import assert from "node:assert/strict";
import { Mesh, MeshBasicMaterial, Raycaster, Vector3, BufferGeometry, Float32BufferAttribute } from "three";
import { roundedBodyGeometry } from "./body3DMesh.mjs";
import { flatBodyBase } from "./body3DBase.mjs";
import { basicBodyOutline } from "./customJarBody.mjs";
import { body3DProfile, bodyWorldPoint } from "./body3DGeometry.mjs";
import { DEEP_BODY_FIXTURE, narrowBodyFixture, POINTED_BODY_FIXTURE } from "../../../tests/fixtures/body3DShapes.mjs";

/** 실제 mesh의 바닥 면과 원본 보존을 검증한다. 외부 API/사용자 사진/DB는 사용하지 않는다. */
test("둥근/뾰족한/복잡한/역방향 틀을 같은 높이의 실제 평면 바닥으로 닫는다",()=>{
  const values=[basicBodyOutline("ROUND"),basicBodyOutline("JAR"),basicBodyOutline("SQUARE"),
    POINTED_BODY_FIXTURE,DEEP_BODY_FIXTURE,narrowBodyFixture()];
  for(const value of values)for(const hollow of [false,true]) {
    const original=structuredClone(value),g=roundedBodyGeometry(value,hollow),base=g.userData.flatBase;
    const p=g.attributes.position,n=g.attributes.normal;
    assert.ok(base.capCount>0);assert.ok(g.index.count/3<=40000);
    assert.ok(Math.abs(g.boundingBox.min.y-base.plane)<1e-6);
    assert.ok(body3DProfile(value).photoContours.flat().every(v=>bodyWorldPoint({x:v.x/480,y:v.y/480}).y>base.plane));
    const height=Math.max(...value.points.map(p=>p.y))-Math.min(...value.points.map(p=>p.y));
    assert.ok(base.trim<=height*2*.035+1e-6);
    for(let i=0;i<p.count;i++)assert.ok(p.getY(i)>=base.plane-1e-6);
    for(let i=base.capStart;i<base.capStart+base.capCount;i++) {
      const vertex=g.index.getX(i);
      assert.ok(Math.abs(p.getY(vertex)-base.plane)<1e-6);
      assert.ok(n.getY(vertex)<-.999999); // 바닥은 곡면 명암이 아닌 아래 방향의 평평한 면이다.
    }
    const mesh=new Mesh(g,new MeshBasicMaterial());mesh.updateMatrixWorld();
    // 각 실제 바닥 삼각형 중심에서 아래→위로 쏘아 바닥 구멍/거꾸로 된 면을 잡는다.
    for(let i=base.capStart;i<base.capStart+base.capCount;i+=3) {
      const center=new Vector3();for(let j=0;j<3;j++)center.add(new Vector3().fromBufferAttribute(p,g.index.getX(i+j)));center.multiplyScalar(1/3);
      const ray=new Raycaster(new Vector3(center.x,-3,center.z),new Vector3(0,1,0));
      const hits=ray.intersectObject(mesh);assert.ok(hits.length>0);
      assert.ok(Math.abs(hits[0].point.y-base.plane)<1e-6);
    }
    assert.deepEqual(value,original);mesh.material.dispose();g.dispose();
  }
  const reverse=roundedBodyGeometry({...POINTED_BODY_FIXTURE,points:POINTED_BODY_FIXTURE.points.toReversed()});
  assert.ok(reverse.userData.flatBase.capCount>0);reverse.dispose();
});

test("두 발은 각자의 바닥을 만들며 오목한 발 사이를 메우지 않는다",()=>{
  for(const hollow of [true,false]) {
    const g=roundedBodyGeometry(DEEP_BODY_FIXTURE,hollow),base=g.userData.flatBase;
    assert.equal(base.loops.length,2);
    const mesh=new Mesh(g,new MeshBasicMaterial());mesh.updateMatrixWorld();
    // 긴 광선은 위쪽 몸통까지 닿는다. 바닥 높이까지만 검사해 실제 발 사이의 빈 공간을 확인한다.
    assert.equal(new Raycaster(new Vector3(0,-3,0),new Vector3(0,1,0),0,3+base.plane+1e-5).intersectObject(mesh).length,0);
    for(const x of [-.65,.65]) {
      const hits=new Raycaster(new Vector3(x,-3,0),new Vector3(0,1,0)).intersectObject(mesh);
      assert.ok(hits.length>0);assert.ok(Math.abs(hits[0].point.y-base.plane)<1e-6);
    }
    mesh.material.dispose();g.dispose();
  }
});

test("절단 바닥의 교차선도 앞뒤 대칭이며 삼각형 분할 순서에 영향을 받지 않는다",()=>{
  for(const value of [basicBodyOutline("ROUND"),narrowBodyFixture(),POINTED_BODY_FIXTURE]) {
    const g=roundedBodyGeometry(value),loops=g.userData.flatBase.loops;
    const distance=(p,a,b)=>{
      const dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz)));
      return Math.hypot(p.x-a.x-t*dx,p.z-a.z-t*dz);
    };
    for(const loop of loops)for(const p of loop) {
      const reflected={x:p.x,z:-p.z};
      const closest=Math.min(...loops.flatMap(poly=>poly.map((a,i)=>distance(reflected,a,poly[(i+1)%poly.length]))));
      assert.ok(closest<2e-6);
    }
    g.dispose();
  }
});

test("절단하지 않는 사진 정점과 UV, 높이 계산은 유지하고 입력 mesh는 변경하지 않는다",()=>{
  // 사진은 위쪽, 몸통은 아래쪽에 있는 닫힌 상자. 저장 원본 대신 절단 함수의 계약만 검사한다.
  const p=[-1,-1,-.2,1,-1,-.2,1,1,-.2,-1,1,-.2,-1,-1,.2,1,-1,.2,1,1,.2,-1,1,.2];
  const index=[0,2,1,0,3,2,4,5,6,4,6,7,0,1,5,0,5,4,0,4,7,0,7,3,1,2,6,1,6,5,3,7,6,3,6,2];
  const source=new BufferGeometry();source.setAttribute("position",new Float32BufferAttribute(p,3));source.setIndex(index);
  source.addGroup(0,30,0);source.addGroup(30,6,1);source.computeBoundingBox();source.userData.photoHeight=()=>.2;
  const before=Array.from(source.attributes.position.array),g=flatBodyBase(source,[[{x:0,y:1}]]),group=g.groups[1];
  const photoVertices=new Set();for(let i=group.start;i<group.start+group.count;i++)photoVertices.add(g.index.getX(i));
  assert.equal(photoVertices.size,4);
  for(const i of photoVertices) {
    assert.equal(g.attributes.position.getY(i),1);
    assert.equal(g.attributes.uv.getX(i),(g.attributes.position.getX(i)+1)/2);
    assert.equal(g.attributes.uv.getY(i),1);
  }
  assert.equal(g.userData.photoHeight,source.userData.photoHeight);
  assert.deepEqual(Array.from(source.attributes.position.array),before);g.dispose();source.dispose();
});

test("사진 창에 안전한 간격이 없는 입력은 원본 대신 사각형 바닥을 만들어 속이지 않는다",()=>{
  const g=roundedBodyGeometry(basicBodyOutline("ROUND"));
  assert.throws(()=>flatBodyBase(g,[[{x:0,y:g.boundingBox.min.y}]]),/Unsupported flat base/);g.dispose();
});
