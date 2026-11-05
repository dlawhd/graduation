import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

// 실제 로더를 가짜 DOM에서 실행한다. SDK 네트워크와 실제 키는 사용하지 않는다.
const source = readFileSync(new URL("./naverMaps.js", import.meta.url), "utf8")
  .replace("export function loadNaverMaps", "function loadNaverMaps")
  .replace("import.meta.env.VITE_NAVER_MAP_KEY_ID", "testKey");
function fixture(key = "test-public-id") {
  const scripts = [], timers = new Map();
  let sequence = 0;
  const window = {};
  const context = vm.createContext({
    window, testKey: key,
    document: { createElement: () => ({ remove() { this.removed = true; } }),
      head: { append: node => scripts.push(node) } },
    setTimeout, clearTimeout,
  });
  window.setTimeout = fn => { const id = ++sequence; timers.set(id, fn); return id; };
  context.clearTimeout = id => timers.delete(id);
  vm.runInContext(source + "; globalThis.load = loadNaverMaps;", context);
  function complete(script = scripts.at(-1)) {
    window.naver = { maps: { Service: { reverseGeocode() {} } } };
    const callback = new URL(script.src).searchParams.get("callback");
    window[callback]?.();
  }
  return { context, window, scripts, timers, complete, load: () => context.load() };
}

test("설정이 없으면 외부 스크립트를 요청하지 않는다", async () => {
  const f = fixture("");
  await assert.rejects(f.load(), /MAP_NOT_CONFIGURED/);
  assert.equal(f.scripts.length, 0);
});
test("동시 로딩을 공유하고 최신 SDK 주소·geocoder를 사용한다", async () => {
  const f = fixture();
  const first = f.load(), second = f.load();
  assert.equal(first, second); assert.equal(f.scripts.length, 1);
  const url = new URL(f.scripts[0].src);
  assert.equal(url.origin, "https://oapi.map.naver.com");
  assert.equal(url.searchParams.get("ncpKeyId"), "test-public-id");
  assert.equal(url.searchParams.get("submodules"), "geocoder");
  f.complete(); await first;
  assert.equal(f.timers.size, 0);
  await f.load(); assert.equal(f.scripts.length, 1);
});
test("네트워크 실패 뒤 다시 시도할 수 있다", async () => {
  const f = fixture(); const first = f.load();
  f.scripts[0].onerror(); await assert.rejects(first, /MAP_LOAD_FAILED/);
  assert.equal(f.scripts[0].removed, true);
  const retry = f.load(); assert.equal(f.scripts.length, 2);
  f.complete(); await retry;
});
test("인증 실패는 성공으로 재사용하지 않고 기존 전역 콜백을 복구한다", async () => {
  const f = fixture(); const old = () => {};
  f.window.navermap_authFailure = old;
  const first = f.load();
  f.window.naver = { maps: { Service: { reverseGeocode() {} } } };
  f.window.navermap_authFailure(); await assert.rejects(first, /MAP_AUTH_FAILED/);
  assert.equal(f.window.navermap_authFailure, old);
  const retry = f.load(); assert.equal(f.scripts.length, 2);
  f.complete(); await retry; assert.equal(f.window.navermap_authFailure, old);
});
test("시간 초과 뒤 이전 스크립트의 콜백은 새 실행을 완료시키지 않는다", async () => {
  const f = fixture(); const first = f.load();
  const oldCallback = new URL(f.scripts[0].src).searchParams.get("callback");
  [...f.timers.values()][0](); await assert.rejects(first, /MAP_LOAD_FAILED/);
  const retry = f.load(); assert.equal(f.window[oldCallback], undefined);
  f.complete(); await retry;
});
test("geocoder 모듈 누락은 성공으로 처리하지 않는다", async () => {
  const f = fixture(); const first = f.load();
  f.window.naver = { maps: {} };
  f.window[new URL(f.scripts[0].src).searchParams.get("callback")]();
  await assert.rejects(first, /MAP_LOAD_FAILED/);
});
