// 순수 표본만 사용해 준비 실패·빈 조회·자료 누락이 합격으로 바뀌지 않는지 확인한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizePhases } from './summarize-scale-phases.mjs';

function point(metric, value, tags = {}) {
  return { type: 'Point', metric, data: { value, time: '2026-10-21T06:00:00Z', tags } };
}

function prepared(vus = 50) {
  const rows = [];
  for (let i = 0; i < vus; i++) {
    for (const step of ['CSRF', 'LOGIN', 'ME', 'JAR_LIST']) {
      rows.push(point('http_req_duration', 10, { phase: 'prepare', step, status: '200' }));
    }
    rows.push(point('preparation_accounts', 1));
  }
  rows.push(point('preparation_ready', 1));
  return rows;
}

test('정상 준비도 조회가 없으면 조회 통과가 아니라 미시작이다', () => {
  for (const vus of [50, 100, 150, 200, 300]) {
    const result = summarizePhases(prepared(vus), vus);
    assert.equal(result.preparation.status, 'PASSED');
    assert.equal(result.reads.status, 'NOT_STARTED');
  }
});

test('준비 요청 시간 초과는 고정 단계명·시간으로 남고 조회는 미시작이다', () => {
  const rows = [point('http_req_duration', 5000, { phase: 'prepare', step: 'ME', status: '0',
    url: 'DO_NOT_COPY', cookie: 'DO_NOT_COPY' }), point('preparation_failures', 1)];
  const result = summarizePhases(rows, 50);
  assert.equal(result.preparation.status, 'FAILED');
  assert.equal(result.preparation.failedRequest.step, 'ME');
  assert.equal(result.reads.status, 'NOT_STARTED');
  assert.equal(JSON.stringify(result).includes('DO_NOT_COPY'), false);
});

test('준비 표식·요청 수·단계·깨진 행·상태 중 하나가 빠져도 실패한다', () => {
  for (const mutate of [r => r.pop(), r => r.shift(),
    r => { r[0].data.tags.step = 'UNKNOWN'; }, r => { r[0].data.tags.status = '500'; }]) {
    const rows = prepared(); mutate(rows);
    assert.equal(summarizePhases(rows, 50).preparation.status, 'FAILED');
  }
  assert.equal(summarizePhases(prepared(), 50, 1).preparation.status, 'FAILED');
});

test('준비 실패 뒤 조회가 있다면 잘못된 실행이며 상위 단계는 거절한다', () => {
  const result = summarizePhases([point('http_req_duration', 1, { phase: 'read', status: '200' })], 50);
  assert.equal(result.reads.status, 'INVALID_PREPARATION');
  assert.throws(() => summarizePhases([], 400));
});
