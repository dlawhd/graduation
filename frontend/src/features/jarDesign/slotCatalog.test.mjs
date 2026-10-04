import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SLOT_CATALOG, LEGACY_SLOT_CATALOG, FREEFORM_SLOT_CATALOG, V43_FREEFORM_SLOT_CATALOG, SLOT_COLLECTIONS, filterSlotStyles, slotPage, getSlotAppearance } from "./slotCatalog.mjs";
import { SLOT_STYLES, normalizeSlot, storedSlot, sameSlot, slotDimensions } from "./slotGeometry.mjs";
import { measureJarDropTarget, createNoteFlight } from "../jarDetail/utils/noteFlightGeometry.mjs";
import { CUTE_SLOT_CATALOG } from "./cuteSlotCatalog.mjs";

test("화면 132종과 숨긴 ID를 포함한 프론트·Java·V45 허용값 156종이 일치한다", () => {
  const ids = [...LEGACY_SLOT_CATALOG, ...FREEFORM_SLOT_CATALOG].map(entry => entry.id);
  assert.equal(SLOT_CATALOG.length,132); assert.equal(FREEFORM_SLOT_CATALOG.length,132); assert.equal(ids.length, 156); assert.equal(new Set(ids).size, 156);
  assert.deepEqual(SLOT_STYLES.map(([id]) => id), SLOT_CATALOG.map(entry=>entry.id));
  const java = readFileSync(new URL("../../../../src/main/java/shop/esjh/memoryjar/enums/ai/JarSlotStyle.java", import.meta.url), "utf8");
  assert.deepEqual(java.split("public enum JarSlotStyle {")[1].split(";")[0].match(/\b[A-Z][A-Z_]+\b/g), ids);
  const sql = readFileSync(new URL("../../../../src/main/resources/db/migration/V45__add_cute_jar_slots.sql", import.meta.url), "utf8");
  const allowed = [...sql.matchAll(/'([A-Z_]+)'/g)].map(match=>match[1]).filter(id=>!["ORIGINAL","COVER","CONTAIN"].includes(id));
  assert.deepEqual(allowed, [...ids, ...ids]);
  assert.ok(ids.every(id=>id.length<=20));
});

test("이전 입구 6종·NULL·미지원 모양의 기본 표시와 분류가 유지된다", () => {
  assert.deepEqual(SLOT_CATALOG.slice(0,6).map(entry=>entry.id), ["CAPSULE","RECTANGLE","OVAL","METAL","WOOD","PIXEL"]);
  for (const value of [null, undefined, "UNKNOWN", ""]) assert.equal(getSlotAppearance(value).id,"CAPSULE");
  assert.equal(filterSlotStyles("전체").length,132);
  for (const collection of SLOT_COLLECTIONS.slice(1)) assert.equal(filterSlotStyles(collection).length,12);
  assert.equal(new Set(SLOT_CATALOG.map(entry=>entry.name)).size,132);
  assert.ok(SLOT_CATALOG.every(entry=>entry.description && SLOT_COLLECTIONS.includes(entry.collection)));
});

test("156종의 저장 복원·변경 감지와 이전/자유형의 서로 다른 경계를 유지한다", () => {
  for (const {id} of [...LEGACY_SLOT_CATALOG,...FREEFORM_SLOT_CATALOG]) {
    const slot = normalizeSlot({slotStyle:id, centerX:0, centerY:1, sizeRatio:1});
    assert.equal(slot.slotStyle,id);
    assert.equal(slot.centerX,.14); assert.equal(slot.centerY,getSlotAppearance(id).freeform ? .86 : .96);
    assert.deepEqual(storedSlot({slotStyle:id, slotCenterX:slot.centerX, slotCenterY:slot.centerY,slotSizeRatio:slot.sizeRatio}),slot);
    assert.equal(sameSlot(slot,{...slot,slotStyle:id==="CAPSULE" ? "PAW" : "CAPSULE"}),false);
  }
});

test("클래식 12종을 노출하고 나머지 이전 ID의 렌더링은 따로 보존한다", () => {
  assert.deepEqual(SLOT_CATALOG.slice(0,12).map(entry=>entry.id),LEGACY_SLOT_CATALOG.slice(0,12).map(entry=>entry.id));
  for (const entry of LEGACY_SLOT_CATALOG.slice(12)) {
    assert.equal(SLOT_CATALOG.some(current=>current.id===entry.id),false);
    assert.equal(getSlotAppearance(entry.id),entry);
    assert.equal(slotDimensions(.5,entry.id).height,.2/3.5);
  }
});

test("자유형의 모든 크기·네 모서리를 보정하고 서버의 정사각 스타일 목록과 일치한다", () => {
  const java=readFileSync(new URL("../../../../src/main/java/shop/esjh/memoryjar/enums/ai/JarSlotStyle.java",import.meta.url),"utf8");
  assert.ok(java.includes('name().endsWith("_GATE")'));
  for (const entry of FREEFORM_SLOT_CATALOG) for (const sizeRatio of [-.5,-.25,0,.001,.33333,.5,1]) for (const x of [0,1]) for (const y of [0,1]) {
    const slot=normalizeSlot({slotStyle:entry.id,centerX:x,centerY:y,sizeRatio});
    const {width,height}=slotDimensions(slot.sizeRatio,entry.id);
    assert.equal(width,height);
    assert.ok(slot.centerX>=width/2-1e-12 && slot.centerX<=1-width/2+1e-12);
    assert.ok(slot.centerY>=height/2-1e-12 && slot.centerY<=1-height/2+1e-12);
  }
  assert.equal(normalizeSlot({slotStyle:"BLOSSOM_GATE",centerX:.5,centerY:.04,sizeRatio:1}).centerY,.14);
});

test("자유형 132종은 모두 고유한 실루엣을 구멍으로 사용한다", () => {
  const source=readFileSync(new URL("./components/FreeformSlotArtwork.jsx",import.meta.url),"utf8");
  for (const entry of V43_FREEFORM_SLOT_CATALOG) {
    assert.ok(entry.path.startsWith("M")); assert.equal(entry.colors.length,4);
    assert.ok(source.includes(`case "${entry.id}":`));
  }
  assert.equal(new Set(FREEFORM_SLOT_CATALOG.map(entry=>entry.path)).size,132);
  assert.ok(source.includes('data-slot-opening d={entry.path}'));
  assert.ok(!source.includes("<rect"));
});

test("기하와 보석은 선택에서만 숨기고 이전 저장 디자인은 모양과 도착점을 유지한다",()=>{
  assert.equal(SLOT_COLLECTIONS.includes("기하와 보석"),false);
  assert.equal(filterSlotStyles("기하와 보석").length,0);
  const hidden=FREEFORM_SLOT_CATALOG.filter(entry=>entry.collection==="기하와 보석");
  assert.equal(hidden.length,12);
  for(const entry of hidden) {
    assert.equal(getSlotAppearance(entry.id),entry);
    assert.equal(SLOT_CATALOG.some(item=>item.id===entry.id),false);
    assert.equal(storedSlot({slotStyle:entry.id,slotCenterX:.5,slotCenterY:.5,slotSizeRatio:0}).slotStyle,entry.id);
  }
});

test("귀여운 세 컬렉션은 각각 12종이고 기존 다섯 컬렉션의 소재 색상을 다양하게 구분한다",()=>{
  assert.equal(CUTE_SLOT_CATALOG.length,36);
  assert.deepEqual([...new Set(CUTE_SLOT_CATALOG.map(entry=>entry.collection))],["포근한 소품","작은 정원","꿈꾸는 장난감"]);
  for(const category of ["동물 친구들","바다의 편지","달과 우주","달콤한 간식","취미와 일상"]) {
    const entries=filterSlotStyles(category);
    assert.ok(new Set(entries.map(entry=>entry.colors[1])).size>=8);
    assert.ok(entries.every(entry=>entry.colors.length===4 && entry.colors.every(color=>/^#[0-9a-f]{6}$/i.test(color))));
  }
  assert.equal(getSlotAppearance("DOLPHIN_GATE").target.x,.5);
  assert.equal(getSlotAppearance("ECLIPSE_GATE").target.x,.73);
});

test("입구 종류와 관계없이 PC·모바일 쪽지의 도착 중심은 실제 저장한 입구다", () => {
  for (const entry of SLOT_CATALOG) for (const imageSize of [280,480,1024]) {
    const slot = normalizeSlot({centerX:.31,centerY:.72,sizeRatio:.3,slotStyle:entry.id});
    const {width,height}=slotDimensions(slot.sizeRatio,entry.id);
    const aim=entry.target || {x:.5,y:.5,width:1,height:1};
    const x=30+(slot.centerX+(aim.x-.5)*width)*imageSize, y=90+(slot.centerY+(aim.y-.5)*height)*imageSize;
    const rect = {left:x-width*aim.width*imageSize/2,top:y-height*aim.height*imageSize/2,width:width*aim.width*imageSize,height:height*aim.height*imageSize};
    const target=measureJarDropTarget({querySelector:selector=>{
      assert.equal(selector,"[data-jar-slot-target]"); return {getBoundingClientRect:()=>rect};
    }});
    assert.ok(Math.abs(target.x-x)<1e-10);
    assert.ok(Math.abs(target.y-y)<1e-10);
    const flight=createNoteFlight(target,{width:390,height:844});
    assert.equal(flight.deltaX,target.x-195); assert.equal(flight.deltaY,target.y-422);
  }
});

test("전체·분류에서 페이지당 최대 6개이며 탐색 중 선택 목록과 원본 순서는 바뀌지 않는다", () => {
  for (const collection of SLOT_COLLECTIONS) {
    const expected = filterSlotStyles(collection), seen=[];
    for (let page=1; page<=slotPage(collection).pages; page++) {
      const result=slotPage(collection,page);
      assert.ok(result.entries.length<=6); seen.push(...result.entries);
    }
    assert.deepEqual(seen,expected);
    assert.equal(slotPage(collection,-5).page,1);
    assert.equal(slotPage(collection,999).page,slotPage(collection).pages);
  }
  assert.equal(slotDimensions(-.5,"CAPSULE").width,.04);
});
