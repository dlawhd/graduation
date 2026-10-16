import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {Mesh,MeshBasicMaterial,Raycaster,Vector3} from "three";
import {IMAGE_ONLY_DEPTH,imageOnlyGeometry,imageOnlyMask,drawImageOnlyPhoto} from "./imageOnly3D.mjs";
import {toCutoutMaskStyle} from "./cutoutGeometry.mjs";

const pixels=(width,height,visible)=>({width,height,data:Uint8ClampedArray.from({length:width*height*4},(_,i)=>i%4===3?(visible(Math.floor(i/4)%width,Math.floor(i/4/width))?255:0):128)});

test("직접 그린 틀의 1·2·8·53px 선 폭과 3D 옆면 깊이를 함께 반영한다",()=>{
  let previous=0;
  for(const thickness of [1,2,8,53]){
    const source=pixels(480,480,(x,y)=>x>=100&&x<380&&y>=100&&y<380&&(x<100+thickness||x>=380-thickness||y<100+thickness||y>=380-thickness));
    const geometry=imageOnlyGeometry(source,{fullResolution:true}),material=new MeshBasicMaterial(),mesh=new Mesh(geometry,[material,material]);mesh.updateMatrixWorld();
    const hit=(x,y)=>new Raycaster(new Vector3(x/240-1,1-y/240,2),new Vector3(0,0,-1)).intersectObject(mesh);
    assert.ok(hit(100+thickness/2,240).length);
    assert.equal(hit(100+thickness+.5,240).length,0);
    assert.equal(hit(240,240).length,0);
    assert.equal(geometry.attributes.normal.count,geometry.attributes.position.count);
    assert.ok([...geometry.attributes.normal.array].every(Number.isFinite));
    assert.ok(Math.abs(geometry.userData.strokeWidth-thickness)<1e-6);
    const depth=geometry.boundingBox.max.z-geometry.boundingBox.min.z;
    assert.ok(depth>previous);previous=depth;
    assert.ok(Math.abs(depth-geometry.userData.extrusionDepth)<1e-6);
    geometry.dispose();material.dispose();
  }
});

test("이미지만 쓰는 디자인의 투명 구멍·분리된 획·두께를 보존한다",()=>{
  const source=pixels(5,5,(x,y)=>x===4||x<3&&y<3&&!(x===1&&y===1)),before=source.data.slice();
  const geometry=imageOnlyGeometry(source),material=new MeshBasicMaterial(),mesh=new Mesh(geometry,[material,material]);mesh.updateMatrixWorld();
  assert.deepEqual(source.data,before);
  assert.ok([...geometry.attributes.position.array,...geometry.attributes.normal.array].every(Number.isFinite));
  assert.ok(Math.abs(geometry.boundingBox.max.z-IMAGE_ONLY_DEPTH/2)<1e-6);
  for(let i=0;i<geometry.groups[0].count;i++){
    const vertex=geometry.index.getX(i),normal=geometry.attributes.normal;
    assert.ok(Math.abs(normal.getX(vertex))<1e-6&&Math.abs(normal.getY(vertex))<1e-6);
    assert.ok(Math.abs(Math.abs(normal.getZ(vertex))-1)<1e-6);
  }
  const hit=(x,y,side)=>new Raycaster(new Vector3((x+.5)/5*2-1,1-(y+.5)/5*2,side*2),new Vector3(0,0,-side)).intersectObject(mesh);
  for(const side of [1,-1]){
    assert.ok(hit(0,0,side).length);assert.ok(hit(4,4,side).length);
    assert.equal(hit(1,1,side).length,0);assert.equal(hit(3,2,side).length,0);
  }
  geometry.dispose();material.dispose();
});

test("꼭짓점만 닿는 획도 경계를 닫아 유효한 부품으로 만든다",()=>{
  const geometry=imageOnlyGeometry(pixels(3,3,(x,y)=>x===y));
  assert.ok([...geometry.attributes.normal.array].every(Number.isFinite));geometry.dispose();
});

test("격자 내부에는 옆벽을 만들지 않고 입력/최대 복잡도를 제한한다",()=>{
  const geometry=imageOnlyGeometry(pixels(2,2,()=>true));
  assert.equal(geometry.groups[1].count,4*6);geometry.dispose();
  const maximum=imageOnlyGeometry(pixels(128,128,()=>true));
  assert.ok(maximum.attributes.position.count<40000);assert.ok(maximum.index.count/3<70000);maximum.dispose();
  for(const input of [pixels(2,2,()=>false),{width:129,height:1,data:new Uint8Array(516)},{width:1,height:1,data:[]}])assert.throws(()=>imageOnlyGeometry(input));
});

test("기존 여러 영역 자르기 마스크를 재사용하고 임의 스타일은 거부한다",()=>{
  const region=[{x:.1,y:.2},{x:.8,y:.2},{x:.5,y:.9}];
  assert.deepEqual(imageOnlyMask(toCutoutMaskStyle([region,region])),[region,region]);
  assert.deepEqual(imageOnlyMask(undefined),[]);
  assert.throws(()=>imageOnlyMask({filter:"blur(2px)"}));
  assert.throws(()=>imageOnlyMask({maskImage:'url("https://example.com/mask.svg")'}));
});

test("가로/세로 사진을 2D와 같은 object-contain으로 배치한다",()=>{
  const draws=[],calls=[];
  const context={clearRect(){},save(){},restore(){calls.push("restore");},drawImage(...args){draws.push(args.slice(1));}};
  drawImageOnlyPhoto(context,{naturalWidth:800,naturalHeight:400});
  drawImageOnlyPhoto(context,{naturalWidth:400,naturalHeight:800},undefined,true);
  assert.deepEqual(draws,[[0,120,480,240],[120,0,240,480]]);
  assert.equal(context.imageSmoothingEnabled,false);assert.equal(calls.length,2);
});

test("반대 방향으로 그린 자르기 영역도 같은 방향으로 합쳐 클립한다",()=>{
  const region=[{x:.1,y:.2},{x:.8,y:.2},{x:.5,y:.9}],paths=[];let current;
  const context={clearRect(){},save(){},restore(){},beginPath(){},moveTo(x,y){current=[{x,y}];},lineTo(x,y){current.push({x,y});},closePath(){paths.push(current);},clip(){},drawImage(){}};
  drawImageOnlyPhoto(context,{naturalWidth:480,naturalHeight:480},toCutoutMaskStyle([region,[...region].reverse()]));
  for(const path of paths)assert.ok(path.reduce((sum,p,i)=>{const q=path[(i+1)%path.length];return sum+p.x*q.y-q.x*p.y;},0)>0);
});

test("공통 뷰어가 이미지 단독·저장된 입구를 연결하고 확대 미리보기의 제목줄로 버튼을 옮긴다",()=>{
  const source=path=>readFileSync(new URL(path,import.meta.url),"utf8");
  const image=source("./components/JarDesignImage.jsx"),viewer=source("./components/CustomJarBodyViewer.jsx");
  const page=source("../../pages/JarDesignNewPage.jsx"),css=source("./bodyWorkshop.css");
  assert.ok(image.includes("if(allow3D && imageUrl)return <CustomJarBodyViewer imageOnly"));
  assert.ok(image.includes("viewControlsTarget,slot}"));
  assert.ok(page.includes("viewControlsTarget={previewControlsTarget}"));
  assert.ok(viewer.includes("min-h-8 min-w-8"));
  assert.ok(css.includes("clamp(340px, 28vw, 400px)"));
});
