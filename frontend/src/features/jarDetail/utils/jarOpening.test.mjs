import test from "node:test";
import assert from "node:assert/strict";
import { canShowJarOpening, initialOpening, openingReducer } from "./jarOpening.mjs";
import { createJarOpeningAudio } from "./jarOpeningAudio.mjs";

test("현재 서버 응답이 열린 저금통일 때만 연출한다", () => {
  const jar = { jarId: 7, isOpen: true };
  assert.equal(canShowJarOpening(true, jar), true);
  for (const value of [false, "true", undefined]) assert.equal(canShowJarOpening(true, { ...jar, isOpen: value }), false);
  assert.equal(canShowJarOpening(false, jar), false);
  assert.equal(canShowJarOpening(true, null), false);
});
test("다른 저금통 이벤트와 잘못된 번호는 거절한다", () => {
  assert.equal(canShowJarOpening(true, { jarId: 7, isOpen: true }, { jarId: 8 }), false);
  for (const jarId of [0, -1, Infinity, NaN, "invalid", 1.5]) assert.equal(canShowJarOpening(true, { jarId, isOpen: true }), false);
  assert.equal(canShowJarOpening(true, { jarId: 7, isOpen: true }, { jarId: "7" }), true);
});
test("세 번의 유효한 두드림 후 완료된다", () => {
  let state = initialOpening;
  for (let hit = 1; hit <= 3; hit++) {
    state = openingReducer(state, { type: "HIT" });
    assert.deepEqual(state, { hits: hit, damage: hit - 1, phase: "tapping" });
    state = openingReducer(state, { type: "IMPACT", hit });
    assert.equal(state.damage, hit);
    state = openingReducer(state, { type: "SETTLE", hit });
  }
  assert.deepEqual(state, { hits: 3, damage: 3, phase: "complete" });
});
test("한 번 두드리는 동안 중복 클릭은 무시한다", () => {
  const tapping = openingReducer(initialOpening, { type: "HIT" });
  for (let i = 0; i < 100; i++) assert.equal(openingReducer(tapping, { type: "HIT" }), tapping);
});
test("이전 단계의 늦은 타이머는 현재 단계를 바꾸지 않는다", () => {
  const state = { hits: 2, phase: "tapping" };
  assert.equal(openingReducer(state, { type: "SETTLE", hit: 1 }), state);
});
test("건너뛰기 후 타이머와 추가 두드림은 완료를 되돌리지 않는다", () => {
  for (const state of [initialOpening, { hits: 1, phase: "tapping" }, { hits: 2, phase: "ready" }]) {
    const complete = openingReducer(state, { type: "SKIP" });
    assert.deepEqual(complete, { hits: 3, damage: 3, phase: "complete" });
    assert.equal(openingReducer(complete, { type: "HIT" }), complete);
    assert.equal(openingReducer(complete, { type: "SETTLE", hit: 1 }), complete);
  }
});
test("클릭한 순간에는 금이 생기지 않고 망치 접촉에서만 손상이 증가한다", () => {
  const tapping = openingReducer(initialOpening, { type: "HIT" });
  assert.equal(tapping.damage, 0);
  assert.equal(openingReducer(tapping, { type: "IMPACT", hit: 2 }), tapping);
  assert.equal(openingReducer(tapping, { type: "IMPACT", hit: 1 }).damage, 1);
});

/** 오디오 정책·자원 해제를 검사하는 로컬 대역이다. 실제 스피커로 소리를 내지 않는다. */
function audioFixture() {
  const contexts = [], voices = [];
  class Context {
    constructor() { this.state = "suspended"; this.currentTime = 0; this.destination = {}; this.closed = false; contexts.push(this); }
    resume() { this.state = "running"; return Promise.resolve(); }
    close() { this.closed = true; return Promise.resolve(); }
    createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, disconnect() {} }; }
    createOscillator() {
      const voice = { frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, disconnect() {}, start() { this.started = true; }, stop() { this.stops = (this.stops || 0) + 1; } };
      voices.push(voice); return voice;
    }
  }
  return { Context, contexts, voices };
}
test("오디오는 명시적 play 전에는 초기화되지 않는다", () => {
  const fixture = audioFixture(), audio = createJarOpeningAudio(fixture.Context);
  assert.equal(fixture.contexts.length, 0); audio.prepare();
  assert.equal(fixture.voices.length, 0); audio.play(1);
  assert.equal(fixture.contexts.length, 1); assert.equal(fixture.voices.length, 1);
  audio.play(2); audio.play(3);
  assert.equal(fixture.contexts.length, 1); assert.equal(fixture.voices.length, 5);
  audio.close();
});
test("음소거와 닫기는 음원을 중지하고 닫힌 뒤 재생하지 않는다", () => {
  const fixture = audioFixture(), audio = createJarOpeningAudio(fixture.Context);
  audio.play(3); audio.stop();
  assert.ok(fixture.voices.every(voice => voice.stops === 2));
  fixture.voices.forEach(voice => voice.onended());
  audio.close(); audio.play(1);
  assert.equal(fixture.contexts[0].closed, true); assert.equal(fixture.voices.length, 3);
});
test("오디오 미지원과 초기화 실패는 연출을 중단하지 않는다", () => {
  assert.doesNotThrow(() => { const audio = createJarOpeningAudio(null); audio.play(1); audio.close(); });
  class Unsupported { constructor() { throw new Error("unsupported"); } }
  assert.doesNotThrow(() => { const audio = createJarOpeningAudio(Unsupported); audio.play(1); audio.close(); });
});
