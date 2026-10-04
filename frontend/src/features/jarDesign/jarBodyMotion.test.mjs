import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JAR_BODIES } from "./jarBodies.mjs";
import { JAR_BODY_MOTIONS, observeJarMotion } from "./jarBodyMotion.mjs";

test("모든 본체가 소재에 맞는 느리고 제한된 연출이 있으며 저장 좌표와 분리한다", () => {
  assert.deepEqual(Object.keys(JAR_BODY_MOTIONS).sort(),JAR_BODIES.map(b=>b.id).sort());
  assert.ok(new Set(Object.values(JAR_BODY_MOTIONS).map(m=>m.kind)).size >= 12);
  for (const motion of Object.values(JAR_BODY_MOTIONS)) {
    assert.ok(Object.isFrozen(motion)); assert.ok(motion.duration >= 7); assert.ok(motion.label.length > 4);
  }
  assert.equal(JAR_BODY_MOTIONS.CAT.kind,"blink"); assert.equal(JAR_BODY_MOTIONS.PERFUME.kind,"jewel");
  const css = readFileSync(new URL("./jarBodyMotion.css",import.meta.url),"utf8");
  assert.match(css,/prefers-reduced-motion: reduce/);
  assert.match(css,/animation-play-state: paused/);
  assert.match(css,/data-motion-active="true"/);
  assert.doesNotMatch(css,/filter:|animation:.*linear/);
});

test("꼬리·귀·목도리의 관절은 고정 SVG 좌표이며 사진·입구 대신 작은 부분만 움직인다", () => {
  const artwork=readFileSync(new URL("./components/JarBodyArtwork.jsx",import.meta.url),"utf8");
  const css=readFileSync(new URL("./jarBodyMotion.css",import.meta.url),"utf8");
  for (const part of ["jar-tail","jar-curly-tail","jar-pom-tail","jar-fin","jar-ear","jar-scarf","jar-flipper"]) {
    assert.ok(artwork.includes(part)); assert.ok(css.includes(part));
  }
  assert.match(css,/transform-box: view-box/);
  assert.match(artwork,/still-body/); assert.match(artwork,/data-jar-photo-safe/);
  assert.doesNotMatch(css,/JarSlot|jar-slot|\.jar-artwork\s*\{[^}]*animation-name/s);
});

test("공유 감시자가 화면 밖·숨긴 탭을 정지하고 마지막 인스턴스에서 정리한다", () => {
  const previousDocument = globalThis.document, previousObserver = globalThis.IntersectionObserver;
  const listeners = new Map(); let creations=0,disconnected=0, callback;
  globalThis.document = {hidden:false,addEventListener:(k,v)=>listeners.set(k,v),removeEventListener:k=>listeners.delete(k)};
  globalThis.IntersectionObserver = class {
    constructor(fn) { creations++; callback=fn; }
    observe() {} unobserve() {} disconnect() { disconnected++; }
  };
  try {
    const a={dataset:{}}, b={dataset:{}};
    const removeA=observeJarMotion(a), removeB=observeJarMotion(b);
    assert.equal(creations,1);
    callback([{target:a,isIntersecting:true},{target:b,isIntersecting:false}]);
    assert.equal(a.dataset.motionActive,"true"); assert.equal(b.dataset.motionActive,"false");
    document.hidden=true; listeners.get("visibilitychange")(); assert.equal(a.dataset.motionActive,"false");
    document.hidden=false; listeners.get("visibilitychange")(); assert.equal(a.dataset.motionActive,"true");
    removeA(); assert.equal(disconnected,0); removeB(); assert.equal(disconnected,1); assert.equal(listeners.size,0);
  } finally { globalThis.document=previousDocument; globalThis.IntersectionObserver=previousObserver; }
});
