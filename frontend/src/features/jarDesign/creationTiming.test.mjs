import test from "node:test";
import assert from "node:assert/strict";
import { presentCreation } from "./creationTiming.mjs";

test("생성 요청을 즉시 시작하고 성공 시 남은 5초 연출만 기다린다", async () => {
  let time = 0; const events = [];
  const result = await presentCreation(async () => { events.push("request"); time = 1200; return 42; },
    { now: () => time, wait: async (ms) => events.push(ms) });
  assert.equal(result, 42); assert.deepEqual(events, ["request", 3800]);
});

test("서버가 이미 5초보다 느리면 추가 대기하지 않는다", async () => {
  let time = 0;
  await presentCreation(async () => { time = 6000; }, { now: () => time, wait: () => assert.fail("추가 대기") });
});

test("생성 오류는 연출 지연 없이 전달하며 재요청하지 않는다", async () => {
  let requests = 0;
  await assert.rejects(presentCreation(async () => { requests++; throw new Error("request failed"); },
    { wait: () => assert.fail("실패 시 대기") }), /request failed/);
  assert.equal(requests, 1);
});
