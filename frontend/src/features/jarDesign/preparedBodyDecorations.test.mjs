import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {Shape,Path,ShapeGeometry,Mesh,MeshBasicMaterial,Raycaster,Vector3} from "three";
import {decorationOutside,solidDecoration,decorationPlacement} from "./preparedBodyDecorations.mjs";

test("사슴의 잎·꽃은 뿔과 깊이가 겹치고 다른 장식의 배치는 유지한다",()=>{
  assert.deepEqual(decorationPlacement("front"),{center:.105,depth:.08});
  assert.deepEqual(decorationPlacement("back"),{center:-.025,depth:.08});
  const antler=decorationPlacement("back"),leaf=decorationPlacement("front","antler");
  const shape=new Shape();shape.moveTo(150,60);shape.lineTo(170,60);shape.lineTo(170,90);shape.closePath();
  const flat=new ShapeGeometry(shape),parts=[antler,leaf].map(p=>solidDecoration(flat,p.center,p.depth));
  const [branchBox,leafBox]=parts.map(p=>p.boundingBox);
  assert.ok(Math.min(branchBox.max.z,leafBox.max.z)-Math.max(branchBox.min.z,leafBox.min.z)>.03);
  assert.ok(leafBox.max.z>branchBox.max.z,"잎은 뿔의 앞쪽에서 보여야 한다");
  const artwork=readFileSync(new URL("./components/AnimalBodyArtwork.jsx",import.meta.url),"utf8");
  assert.ok(artwork.includes('<g data-body-attachment="antler">{leaf(155,96)}'));
  assert.equal((artwork.match(/data-body-attachment=/g)||[]).length,1,"사슴 소품만 조정한다");
  parts.forEach(part=>part.dispose());flat.dispose();
});

test("몸통 밖 장식과 내부 표정/곡선 근사 오차를 구분한다",()=>{
  const outline=[{x:.2,y:.2},{x:.8,y:.2},{x:.8,y:.8},{x:.2,y:.8}];
  assert.equal(decorationOutside([{x:240,y:40}],outline),true);
  assert.equal(decorationOutside([{x:240,y:240}],outline),false);
  assert.equal(decorationOutside([{x:95.5,y:240}],outline),false);
});
test("장식의 앞뒤와 옆벽을 닫고 구멍·원래 위치·색 UV를 보존한다",()=>{
  const shape=new Shape();shape.moveTo(100,100);shape.lineTo(200,100);shape.lineTo(200,200);shape.lineTo(100,200);shape.closePath();
  const hole=new Path();hole.moveTo(140,140);hole.lineTo(140,160);hole.lineTo(160,160);hole.lineTo(160,140);hole.closePath();shape.holes.push(hole);
  const flat=new ShapeGeometry(shape),before=flat.attributes.position.array.slice(),solid=solidDecoration(flat);
  assert.deepEqual(flat.attributes.position.array,before);
  assert.ok([...solid.attributes.position.array,...solid.attributes.normal.array].every(Number.isFinite));
  assert.ok(solid.groups.every(group=>group.count>0));
  const material=new MeshBasicMaterial(),mesh=new Mesh(solid,[material,material]);mesh.updateMatrixWorld();
  for(const side of [1,-1]){
    const hits=new Raycaster(new Vector3((120-240)/240,(240-120)/240,side*2),new Vector3(0,0,-side)).intersectObject(mesh);
    assert.ok(hits.length>0);assert.ok(Math.abs(hits[0].point.z-(.105+side*.04))<1e-6);
  }
  assert.equal(new Raycaster(new Vector3((150-240)/240,(240-150)/240,2),new Vector3(0,0,-1)).intersectObject(mesh).length,0);
  for(let i=0;i<solid.attributes.position.count;i++){
    assert.ok(Math.abs(solid.attributes.uv.getX(i)-(solid.attributes.position.getX(i)+1)/2)<1e-6);
    assert.ok(Math.abs(solid.attributes.uv.getY(i)-(solid.attributes.position.getY(i)+1)/2)<1e-6);
  }
  material.dispose();flat.dispose();solid.dispose();
});
test("원래 장식만 전달하고 분위기 효과/바닥 그림자는 장식 부품으로 만들지 않는다",()=>{
  const artwork=readFileSync(new URL("./components/JarBodyArtwork.jsx",import.meta.url),"utf8");
  const prepared=readFileSync(new URL("./components/PreparedJarBodyViewer.jsx",import.meta.url),"utf8");
  assert.ok(artwork.includes('data-body-decoration="back"'));
  assert.ok(artwork.includes('layer="front"/></g><Atmosphere'));
  assert.ok(prepared.includes('querySelectorAll("defs,[data-body-decoration]")'));
});
