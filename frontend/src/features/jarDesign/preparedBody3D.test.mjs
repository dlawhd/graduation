import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {BufferGeometry,Float32BufferAttribute} from "three";
import {getJarBody,SELECTABLE_JAR_BODIES} from "./jarBodies.mjs";
import {PREPARED_3D_IDS,preparedPhotoContour,supportsPrepared3D,preparedBodyOutline,preparedPhotoLayout,preparedBodyProfile} from "./preparedBody3D.mjs";
import {coverPhotoFrame,containPhotoFrame,photoFrameStyle} from "./photoFraming.mjs";
import {preparedMaterialGroups,addPreparedBodyRelief} from "./preparedBodyRelief.mjs";
import {Group,Mesh,MeshStandardMaterial,BoxGeometry} from "three";

test("선택 가능한 28종 모두 활성화하고 기존 사진 창 좌표를 보존한다",()=>{
  assert.deepEqual(PREPARED_3D_IDS,SELECTABLE_JAR_BODIES.map(body=>body.id));
  assert.equal(PREPARED_3D_IDS.length,28);
  assert.equal(supportsPrepared3D("UNKNOWN"),false);
  for(const id of PREPARED_3D_IDS){
    const body=getJarBody(id),snapshot=structuredClone(body),w=body.window;
    const points=preparedPhotoContour(w);
    assert.equal(points.length,36);
    assert.ok(points.every(p=>p.x>=w.x/480-1e-10&&p.x<=(w.x+w.width)/480+1e-10&&p.y>=w.y/480-1e-10&&p.y<=(w.y+w.height)/480+1e-10));
    assert.deepEqual(body,snapshot);
  }
});
test("SVG 곡선은 저장하지 않는 최대 96점으로 변환한다",()=>{
  const body=getJarBody("CAT"),path={setAttribute(name,value){assert.equal(value,body.path);},getTotalLength(){return 100;},
    getPointAtLength(length){const angle=length/100*Math.PI*2;return {x:240+160*Math.cos(angle),y:240+180*Math.sin(angle)};}};
  const value=preparedBodyOutline(body,path);
  assert.equal(value.points.length,96);assert.equal(value.photoContours.length,1);
  assert.throws(()=>preparedBodyOutline({id:"UNKNOWN"},path));
});
test("앞면 무늬/양쪽 사진/뒷면 단색의 재질을 분리하며 삼각형을 보존한다",()=>{
  const g=new BufferGeometry();
  g.setAttribute("position",new Float32BufferAttribute([0,0,1,1,0,1,0,1,1,0,0,-1,0,1,-1,1,0,-1],3));
  g.setIndex([0,1,2,3,4,5,0,1,2]);g.addGroup(0,6,0);g.addGroup(6,3,1);
  preparedMaterialGroups(g);assert.equal(g.index.count,9);
  assert.deepEqual(g.groups.map(group=>group.materialIndex),[0,1,2]);
  assert.ok(g.groups.every(group=>group.count===3));g.dispose();
});
test("내부 코/리본 세공은 유효한 입체 부품이고 정리 시 모두 제거한다",()=>{
  for(const id of PREPARED_3D_IDS){
    const group=new Group(),geometry=new BoxGeometry(2,2,.4),material=new MeshStandardMaterial();
    const mesh=new Mesh(geometry,material);group.add(mesh);
    const cleanup=addPreparedBodyRelief(group,mesh,getJarBody(id),null);
    assert.ok(group.children.length>=1);
    if(["PIG","CAT","RABBIT"].includes(id))assert.ok(group.children.length>=2);
    else assert.equal(group.children.length,1,`${id}: 관련 없는 고양이 꼬리를 붙이지 않는다`);
    for(const object of group.children)assert.ok([...object.geometry.attributes.position.array].every(Number.isFinite));
    cleanup();assert.equal(group.children.length,1);geometry.dispose();material.dispose();
  }
});
test("카탈로그의 여백 바깥 좌표는 자르지 않고 사진 창 안전성은 계속 검증한다",()=>{
  const value={points:[{x:.01,y:.1},{x:.99,y:.1},{x:.99,y:.99},{x:.01,y:.99}],photoContours:[preparedPhotoContour(getJarBody("PIG").window)]};
  const profile=preparedBodyProfile(value,getJarBody("PIG"));
  assert.equal(profile.photoSafe,true);assert.deepEqual(profile.renderOutline,value.points);
  assert.deepEqual(profile.window,getJarBody("PIG").window);
  assert.equal(preparedBodyProfile({...value,points:value.points.map(p=>({x:p.x/10,y:p.y/10}))},getJarBody("PIG")).photoSafe,false);
});
test("기존 사진 없음 배치/확대/전체 보기는 준비된 2D 사진 공식과 일치한다",()=>{
  for(const id of PREPARED_3D_IDS){
    const w=getJarBody(id).window;
    for(const frame of [coverPhotoFrame(w),coverPhotoFrame(w,undefined,2,1,0),containPhotoFrame({x:0,y:.2,width:1,height:.6})]){
      const style=photoFrameStyle(frame,w),layout=preparedPhotoLayout(w,frame,{});
      assert.equal(layout.x,w.x+parseFloat(style.left)*w.width/100);
      assert.equal(layout.width,parseFloat(style.width)*w.width/100);
      assert.equal(layout.height,parseFloat(style.height)*w.height/100);
    }
    const legacy=preparedPhotoLayout(w,null,{naturalWidth:800,naturalHeight:400});
    assert.equal(legacy.width,Math.min(w.width,w.height));assert.equal(legacy.height,legacy.width/2);
  }
});
test("준비된 본체 전환 버튼은 클립 밖에 두고 고정 높이에서도 정사각형을 유지한다",()=>{
  const viewer=readFileSync(new URL("./components/CustomJarBodyViewer.jsx",import.meta.url),"utf8");
  const prepared=readFileSync(new URL("./components/PreparedJarBodyViewer.jsx",import.meta.url),"utf8");
  const stage=readFileSync(new URL("./components/JarBodyStage.jsx",import.meta.url),"utf8");
  assert.ok(prepared.includes("controlsOutside {...props}"));
  assert.ok(viewer.indexOf("createPortal(controls,viewControlsTarget)")<viewer.indexOf("<div data-view-stage"));
  assert.ok(viewer.includes('width:"min(100cqw, 100cqh)",height:"min(100cqw, 100cqh)"'));
  assert.ok(stage.includes("viewerStageStyle="));
});
test("선택 카드의 해상도 표시는 제거하고 같은 제목줄에 전환 버튼을 연결한다",()=>{
  const picker=readFileSync(new URL("./components/JarBodyPicker.jsx",import.meta.url),"utf8");
  assert.ok(!picker.includes("480 × 480"));
  assert.ok(picker.includes("data-preview-header-controls"));
  assert.ok(picker.includes("viewControlsTarget={viewControlsTarget}"));
});
