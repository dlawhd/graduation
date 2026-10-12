import test from "node:test";
import assert from "node:assert/strict";
import { Mesh, MeshBasicMaterial, Raycaster, Vector3, Group, OrthographicCamera } from "three";
import { roundedBodyGeometry } from "./body3DMesh.mjs";
import { basicBodyOutline, outlineError } from "./customJarBody.mjs";
import { CHARACTER_SHAPES, drawCharacterShape } from "./characterShapes.mjs";
import { BODY_3D_DEPTH, BODY_3D_EDGE_DEPTH, BODY_3D_SURFACE, body3DOutline, bodyViewExtent } from "./body3DGeometry.mjs";

/** 실제 캐릭터 경로를 좌표로 샘플링해 귀/골짜기가 있는 외곽도 브라우저 없이 검증한다. */
function characterOutline(id) {
  const points=[];
  const ctx={
    moveTo(x,y) { points.push({x,y}); },lineTo(x,y) { points.push({x,y}); },closePath() {},
    bezierCurveTo(ax,ay,bx,by,x,y) {
      const start=points.at(-1);
      for (let i=1;i<=5;i++) {
        const t=i/5,u=1-t;
        points.push({x:u*u*u*start.x+3*u*u*t*ax+3*u*t*t*bx+t*t*t*x,
          y:u*u*u*start.y+3*u*u*t*ay+3*u*t*t*by+t*t*t*y});
      }
    },
  };
  drawCharacterShape(ctx,id,.2,.15,.6,.7);
  if (Math.hypot(points[0].x-points.at(-1).x,points[0].y-points.at(-1).y)<.0001) points.pop();
  const value={color:"#eab0c5",points};assert.equal(outlineError(value),"",id);return value;
}
const deep={color:"#123456",points:[{x:.1,y:.1},{x:.9,y:.1},{x:.9,y:.9},{x:.65,y:.9},
  {x:.65,y:.3},{x:.35,y:.3},{x:.35,y:.9},{x:.1,y:.9}]};
const shapes=[...["ROUND","JAR","SQUARE"].map(kind=>[kind,basicBodyOutline(kind)]),
  ...CHARACTER_SHAPES.map(([id])=>[id,characterOutline(id)]),["deep",deep]];

test("최대 96점의 굴곡과 역방향 외곽에서도 계산량을 제한하고 양쪽 면을 바깥으로 향하게 한다",()=>{
  const value={color:"#ffffff",points:Array.from({length:96},(_,i)=>{
    const angle=i*Math.PI/48,r=i%2?.3:.34;return {x:.5+r*Math.cos(angle),y:.5+r*Math.sin(angle)};
  })};
  for (const points of [value.points,value.points.toReversed()]) {
    const geometry=roundedBodyGeometry({...value,points}),material=new MeshBasicMaterial(),mesh=new Mesh(geometry,material);
    mesh.updateMatrixWorld();
    assert.ok(geometry.index.count/3<40000);
    for (const sign of [1,-1]) {
      const hits=new Raycaster(new Vector3(0,0,sign*3),new Vector3(0,0,-sign)).intersectObject(mesh);
      assert.ok(hits.length>0);assert.ok(Math.abs(hits[0].point.z-sign*BODY_3D_DEPTH/2)<1e-6);
    }
    material.dispose();geometry.dispose();
  }
});

test("기본 틀과 캐릭터 12종은 유효한 곡면/법선을 만들고 좌표와 색상을 변경하지 않는다",()=>{
  for (const [name,value] of shapes) {
    const snapshot=structuredClone(value),geometry=roundedBodyGeometry(value);
    const position=geometry.attributes.position,normal=geometry.attributes.normal;
    assert.ok([...position.array,...normal.array].every(Number.isFinite),name);
    assert.ok(geometry.index.count>0 && geometry.index.count/3<40000,name);
    assert.ok(geometry.boundingBox.max.z<=BODY_3D_DEPTH/2+1e-6,name);
    assert.ok(geometry.boundingBox.min.z>=-BODY_3D_DEPTH/2-1e-6,name);
    assert.ok(BODY_3D_SURFACE>geometry.boundingBox.max.z,name);
    for (let i=0;i<normal.count;i++) assert.ok(Math.hypot(normal.getX(i),normal.getY(i),normal.getZ(i))>.5,name);
    assert.deepEqual(value,snapshot);geometry.dispose();
  }
});

test("둥근 몸통은 앞뒤가 대칭으로 봉긋하고 가장자리에는 얇은 연결 띠만 남긴다",()=>{
  const geometry=roundedBodyGeometry(basicBodyOutline("ROUND")),p=geometry.attributes.position;
  const levels=new Set(),coordinates=new Set();
  for (let i=0;i<p.count;i++) {
    levels.add(Math.round(Math.abs(p.getZ(i))*1e5));
    coordinates.add(`${p.getX(i).toFixed(5)},${p.getY(i).toFixed(5)},${p.getZ(i).toFixed(5)}`);
  }
  assert.equal(levels.size,13);
  for (let i=0;i<p.count;i++) {
    const z=Math.abs(p.getZ(i));
    assert.ok(coordinates.has(`${p.getX(i).toFixed(5)},${p.getY(i).toFixed(5)},${z.toFixed(5)}`));
    // 0과 -0의 문자열 차이는 정점이 아닌 표현 차이이므로 경계는 별도로 확인한다.
    if(z>1e-6) assert.ok(coordinates.has(`${p.getX(i).toFixed(5)},${p.getY(i).toFixed(5)},${(-z).toFixed(5)}`));
  }
  assert.ok(Math.abs(geometry.boundingBox.max.z-geometry.boundingBox.min.z-BODY_3D_DEPTH)<1e-6);
  geometry.dispose();
});

test("실제 곡면도 테두리 근처는 얇고 앞뒤 사진 판은 이전보다 바깥으로 나온다",()=>{
  const geometry=roundedBodyGeometry(basicBodyOutline("ROUND")),material=new MeshBasicMaterial(),mesh=new Mesh(geometry,material);
  mesh.updateMatrixWorld();
  for(const sign of [1,-1]) {
    const edge=new Raycaster(new Vector3(.69,-.04,sign*3),new Vector3(0,0,-sign)).intersectObject(mesh);
    const center=new Raycaster(new Vector3(0,-.04,sign*3),new Vector3(0,0,-sign)).intersectObject(mesh);
    assert.ok(edge.length>0 && center.length>0);
    assert.ok(Math.abs(edge[0].point.z)<.04);
    assert.ok(Math.abs(center[0].point.z)>.22);
  }
  const p=geometry.attributes.position;
  assert.ok([...p.array].filter((_,i)=>i%3===2).some(z=>Math.abs(Math.abs(z)-BODY_3D_EDGE_DEPTH/2)<1e-6));
  material.dispose();geometry.dispose();
});

test("사진 자리의 앞뒤 판은 평평하고 빈 틀에는 실제 통과하는 구멍이 있다",()=>{
  const material=new MeshBasicMaterial(),ray=new Raycaster(new Vector3(0,0,3),new Vector3(0,0,-1));
  for (const kind of ["ROUND","JAR","SQUARE"]) {
    const value=basicBodyOutline(kind),full=roundedBodyGeometry(value),hollow=roundedBodyGeometry(value,true);
    const solidMesh=new Mesh(full,material),emptyMesh=new Mesh(hollow,material);
    solidMesh.updateMatrixWorld();emptyMesh.updateMatrixWorld();
    const hits=ray.intersectObject(solidMesh);
    assert.ok(hits.length>0,kind);assert.ok(Math.abs(hits[0].point.z-BODY_3D_DEPTH/2)<1e-6,kind);
    assert.equal(ray.intersectObject(emptyMesh).length,0,kind);
    full.dispose();hollow.dispose();
  }
  material.dispose();
});

test("오목한 골짜기 바깥을 삼각형으로 덮지 않고 깊은 빈 틀은 안전하게 거절한다",()=>{
  const geometry=roundedBodyGeometry(deep),material=new MeshBasicMaterial(),mesh=new Mesh(geometry,material);
  mesh.updateMatrixWorld();
  assert.equal(new Raycaster(new Vector3(0,-.5,3),new Vector3(0,0,-1)).intersectObject(mesh).length,0);
  assert.ok(new Raycaster(new Vector3(-.65,-.5,3),new Vector3(0,0,-1)).intersectObject(mesh).length>0);
  assert.throws(()=>roundedBodyGeometry(deep,true),/Unsupported outline/);
  assert.throws(()=>roundedBodyGeometry({points:[],color:"#ffffff"}),/Unsupported outline/);
  material.dispose();geometry.dispose();
});

test("새 곡면의 실제 정점도 회전/기울기/세로 화면에서 카메라 범위 안에 들어간다",()=>{
  const group=new Group();
  for (const kind of ["ROUND","JAR","SQUARE","characterCat"]) {
    const value=shapes.find(([name])=>name===kind)[1],geometry=roundedBodyGeometry(value),p=geometry.attributes.position;
    for (const aspect of [.75,1,1.5]) for (const yaw of [0,.8,Math.PI/2,2.5,Math.PI]) for (const pitch of [-.55,0,.55]) {
      const view=bodyViewExtent(body3DOutline(value),yaw,pitch,aspect);
      const camera=new OrthographicCamera(-view*aspect,view*aspect,view,-view,.1,20);
      camera.position.set(0,0,5);camera.updateMatrixWorld();group.rotation.set(pitch,yaw,0);group.updateMatrixWorld();
      for (let i=0;i<p.count;i++) {
        const projected=group.localToWorld(new Vector3().fromBufferAttribute(p,i)).project(camera);
        assert.ok(Math.abs(projected.x)<1 && Math.abs(projected.y)<1,kind);
      }
    }
    geometry.dispose();
  }
});
