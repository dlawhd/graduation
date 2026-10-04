import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

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
