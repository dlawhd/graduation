import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { slotGlints, slotGlintTiming } from './slotGlints.mjs';
import { LEGACY_SLOT_CATALOG, FREEFORM_SLOT_CATALOG } from './slotCatalog.mjs';

test('입구 연출은 실제 구멍/쪽지 목표 대신 장식만 움직이고 접근성과 공유 정지를 유지한다',()=>{
  const css=readFileSync(new URL('./slotMotion.css',import.meta.url),'utf8');
  const overlay=readFileSync(new URL('./components/JarSlotOverlay.jsx',import.meta.url),'utf8');
  assert.match(css,/prefers-reduced-motion:reduce/);
  assert.match(css,/infinite paused/);
  assert.match(css,/data-motion-active="true"/);
  assert.match(css,/slot-orbit/);
  assert.doesNotMatch(css,/data-jar-slot-target|data-slot-opening|setInterval|filter:/);
  assert.match(overlay,/observeJarMotion\(ref.current\)/);
  assert.match(overlay,/entry.target.x\*100/);
});

test('저장 호환 156종 모두 짧은 십자 반사광 두 개를 가지며 구멍을 가리지 않는 마스크를 쓴다',()=>{
  const artwork=readFileSync(new URL('./components/SlotSparkles.jsx',import.meta.url),'utf8');
  const css=readFileSync(new URL('./slotMotion.css',import.meta.url),'utf8');
  for(const entry of [...LEGACY_SLOT_CATALOG,...FREEFORM_SLOT_CATALOG]) {
    const points=slotGlints(entry), bounds=entry.freeform?[100,100]:[210,60];
    assert.equal(points.length,2);
    assert.ok(points.every(([x,y])=>x>0 && y>0 && x<bounds[0] && y<bounds[1]));
    assert.notDeepEqual(points[0],points[1]);
    assert.ok(slotGlintTiming(entry.id).duration>=8.6);
  }
  assert.match(artwork,/data-slot-sparkles/);
  assert.match(artwork,/fill="black" transform="translate\(50 50\) scale\(\.72\)/);
  assert.match(artwork,/pointer-events-none/);
  assert.match(css,/0%,65%,75%,100% \{ opacity:0/);
  assert.match(css,/slot-glint\) \{ opacity:0!important/);
});
