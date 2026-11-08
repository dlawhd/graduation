import test from "node:test";
import assert from "node:assert/strict";
import { refreshSharedSession } from "./authRefreshCoordination.mjs";

test("두 탭은 잠금을 기다린 뒤 새 쿠키를 확인하므로 회전은 한 번이다", async () => {
  let queue = Promise.resolve(), valid = false, calls = 0;
  const locks = { request(name, options, run) { const task = queue.then(run); queue = task.catch(() => {}); return task; } };
  const options = { locks, probe: async () => valid, refresh: async () => { calls++; valid = true; } };
  await Promise.all([refreshSharedSession(options), refreshSharedSession(options)]);
  assert.equal(calls, 1);
});
test("진짜 만료는 숨기지 않고 401을 반환한다", async () => {
  const error = { response: { status: 401 } };
  await assert.rejects(refreshSharedSession({ locks: null, probe: async () => false, refresh: async () => { throw error; } }), e => e === error);
});
test("잠금 미지원 환경의 회전 충돌도 유효한 새 세션이 있으면 복구한다", async () => {
  let probes = 0;
  await refreshSharedSession({ locks: null, probe: async () => ++probes > 1,
    refresh: async () => { throw { response: { status: 401 } }; } });
  assert.equal(probes, 2);
});
test("서버 장애는 만료로 바꾸거나 회전 요청을 추가하지 않는다", async () => {
  let calls = 0; const error = { response: { status: 503 } };
  await assert.rejects(refreshSharedSession({ locks: null, probe: async () => { throw error; }, refresh: async () => calls++ }), e => e === error);
  assert.equal(calls, 0);
});
test("로그아웃으로 취소된 대기 작업은 인증 요청을 보내지 않는다", async () => {
  const controller = new AbortController(); controller.abort(); let calls = 0;
  await assert.rejects(refreshSharedSession({ locks: null, signal: controller.signal, probe: async () => calls++, refresh: async () => calls++ }), { name: "AbortError" });
  assert.equal(calls, 0);
});
