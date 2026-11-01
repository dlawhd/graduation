import { test } from "node:test";
import assert from "node:assert/strict";
import { setTimeout as wait } from "node:timers/promises";
import { createCoalescedRefresh } from "./coalescedRefresh.mjs";
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return {promise, resolve}; };

test("수신 폭주는 합치고 실행 중 변경도 한 번 더 읽으며 동시 실행은 하나다", async () => {
  const first = deferred(), second = deferred(), release = deferred();
  let calls = 0, active = 0, peak = 0;
  const refresh = createCoalescedRefresh(async () => {
    peak = Math.max(peak, ++active); calls++;
    if (calls === 1) { first.resolve(); await release.promise; } else second.resolve();
    active--;
  }, 0);
  try {
    for (let i = 0; i < 50; i++) refresh.request();
    await first.promise;
    for (let i = 0; i < 50; i++) refresh.request();
    assert.equal(calls, 1); release.resolve(); await second.promise;
    assert.equal(calls, 2); assert.equal(peak, 1);
  } finally { refresh.dispose(); }
});

test("실패 뒤 새 변경은 다시 읽고 폐기된 예약은 실행하지 않는다", async () => {
  const first = deferred(), second = deferred(); let calls = 0;
  const refresh = createCoalescedRefresh(async () => {
    calls++; if (calls === 1) { first.resolve(); throw new Error("fixture"); } second.resolve();
  }, 0);
  try {
    refresh.request(); await first.promise; await wait(5);
    refresh.request(); await second.promise; assert.equal(calls, 2);
    refresh.request(); refresh.dispose(); await wait(5); assert.equal(calls, 2);
  } finally { refresh.dispose(); }
});

test("화면을 떠나면 실행 중 발생한 변경도 추가 요청을 만들지 않는다", async () => {
  const first = deferred(), release = deferred(); let calls = 0;
  const refresh = createCoalescedRefresh(async () => { calls++; first.resolve(); await release.promise; }, 0);
  refresh.request(); await first.promise; refresh.request(); refresh.dispose(); release.resolve();
  await wait(5); assert.equal(calls, 1);
});
