// 혼합된 새 진단과 구버전 자료를 외부 요청 없이 읽어 로그인/CSRF를 혼동하지 않는지 검사한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

for (const legacy of [false, true]) {
  test(`로그인과 CSRF 분리 및 중복 제거: legacy=${legacy}`, () => {
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'memoryjar-summary-test-'));
    try {
      const login = { diagnosticId: 1, startedAt: '2026-10-18T00:00:01Z', completedAt: '2026-10-18T00:00:02Z',
        ...(legacy ? {} : { requestKind: 'LOGIN' }) };
      const csrf = { ...login, diagnosticId: 2, requestKind: 'CSRF' };
      const sample = { observedAt: '2026-10-18T00:00:05Z', intervalSeconds: 5, containers: [{ name: '/spring-api', id: 'jvm' }],
        cpuPercent: 1, memAvailableBytes: 200000000, ioWaitPercent: 0, swapInBytesPerSecond: 0, swapOutBytesPerSecond: 0,
        application: { measurable: true, heap: { usedBytes: 1, maxBytes: 10 }, pools: [{ activeConnections: 0, pendingRequests: 0 }],
          loginDiagnostics: { enabled: true, recent: legacy ? [login] : [login, csrf] } } };
      fs.writeFileSync(path.join(folder, 'summary.json'), JSON.stringify({ status: 'LOAD_FAILED', reason: 'SETUP_TIMEOUT' }));
      fs.writeFileSync(path.join(folder, 'samples.jsonl'), [sample, sample].map(s => JSON.stringify({ sample: s })).join('\n'));
      fs.writeFileSync(path.join(folder, 'k6-metrics.jsonl'), '');
      const run = spawnSync(process.execPath, [fileURLToPath(new URL('./summarize-read-run.mjs', import.meta.url)), folder], { encoding: 'utf8' });
      assert.equal(run.status, 0, run.stderr);
      const result = JSON.parse(run.stdout);
      assert.equal(result.loginSamples.length, 1);
      assert.equal(result.csrfSamples.length, legacy ? 0 : 1);
      assert.deepEqual(result.windows[0].loginDiagnosticIds, [1]);
      assert.deepEqual(result.windows[0].csrfDiagnosticIds, legacy ? [] : [2]);
      assert.equal(result.readErrorRate, null);
      assert.equal(result.guardStatus, 'LOAD_FAILED');
      assert.deepEqual(result.readSamples, []);
      assert.equal(result.readDiagnosticsEnabled, null);
    } finally {
      fs.rmSync(folder, { recursive: true, force: true });
    }
  });
}

test('조회 recent·slow 중복 제거, 로그인 분리, 보관 누락 수와 JVM 교체 구분', () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'memoryjar-read-summary-test-'));
  try {
    const read = { diagnosticId: 1, requestKind: 'ME', startedAt: '2026-10-20T00:00:01Z',
      completedAt: '2026-10-20T00:00:02Z', database: { CONNECTION_ACQUIRE: { count: 2, totalNanos: 90, maxNanos: 60 } } };
    const sample = identity => ({ observedAt: '2026-10-20T00:00:05Z', intervalSeconds: 5,
      containers: [{ name: '/spring-api', id: identity }], cpuPercent: 1, memAvailableBytes: 200000000,
      ioWaitPercent: 0, swapInBytesPerSecond: 0, swapOutBytesPerSecond: 0,
      application: { measurable: true, heap: { usedBytes: 1, maxBytes: 10 }, pools: [{ activeConnections: 0, pendingRequests: 0 }],
        loginDiagnostics: { enabled: true, recent: [], reads: { enabled: true, completedCount: 100,
          recentEvictedCount: 36, slowEvictedCount: 0, recent: [read], slow: [read] } } } });
    fs.writeFileSync(path.join(folder, 'summary.json'), JSON.stringify({ status: 'LOAD_FAILED', reason: 'COLLECTION_ERROR' }));
    fs.writeFileSync(path.join(folder, 'samples.jsonl'), [sample('old'), sample('old'), sample('new')]
      .map(sample => JSON.stringify({ sample })).join('\n'));
    fs.writeFileSync(path.join(folder, 'k6-metrics.jsonl'), '');
    const run = spawnSync(process.execPath, [fileURLToPath(new URL('./summarize-read-run.mjs', import.meta.url)), folder], { encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
    const result = JSON.parse(run.stdout);
    assert.equal(result.readDiagnosticsEnabled, true);
    assert.equal(result.loginSamples.length, 0);
    assert.equal(result.csrfSamples.length, 0);
    assert.equal(result.readSamples.length, 2);
    assert.equal(result.readSamples[0].database.CONNECTION_ACQUIRE.count, 2);
    assert.equal(result.readRetention.length, 2);
    assert.equal(result.readRetention[0].recentEvictedCount, 36);
    assert.deepEqual(result.windows[0].readDiagnosticIds, [1]);
    assert.equal(result.guardStatus, 'LOAD_FAILED');
  } finally { fs.rmSync(folder, { recursive: true, force: true }); }
});
