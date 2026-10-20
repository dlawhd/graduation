// 운영 요청 없이 k6·자원 원본의 같은 시간 창을 비교한다. 중단 결과를 통과로 바꾸지 않는다.
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

const folder = path.resolve(process.argv[2] || '');
if (!process.argv[2] || !fs.existsSync(path.join(folder, 'summary.json'))) throw new Error('COMPLETED_GUARD_RESULT_REQUIRED');
const guard = JSON.parse(fs.readFileSync(path.join(folder, 'summary.json'), 'utf8'));
const resources = fs.readFileSync(path.join(folder, 'samples.jsonl'), 'utf8').trim().split(/\r?\n/)
  .filter(Boolean).map(line => JSON.parse(line).sample);
const reads = [], errors = [], cleanups = [], phases = {};
let incompleteMetricLines = 0;
const input = readline.createInterface({ input: fs.createReadStream(path.join(folder, 'k6-metrics.jsonl')), crlfDelay: Infinity });
for await (const line of input) {
  let value;
  // 강제 중단으로 마지막 JSON 행이 잘렸다면 누락 수를 숨기지 않는다.
  try { value = JSON.parse(line); } catch (_) { incompleteMetricLines++; continue; }
  if (value.type !== 'Point') continue;
  if (value.metric === 'http_req_duration') {
    const phase = value.data.tags.phase || 'unknown';
    phases[phase] = (phases[phase] || 0) + 1;
    if (phase === 'read') reads.push(value.data);
  }
  if (value.metric === 'read_errors') errors.push(value.data.value);
  if (value.metric === 'cleanup_errors') cleanups.push(value.data.value);
}
function p95(values) {
  if (!values.length) return null;
  const v = values.slice().sort((a, b) => a - b), index = (v.length - 1) * .95, a = Math.floor(index);
  return +(v[a] + (v[Math.ceil(index)] - v[a]) * (index - a)).toFixed(3);
}
const valid = resources.filter(s => s.application && s.application.measurable === true);
// 같은 최근 기록이 5초마다 반복 수집되므로 JVM 내 진단 ID로 중복만 제거한다.
const loginRecords = new Map();
const readRecords = new Map(), readRetention = new Map();
for (const s of valid) {
  const api = s.containers?.find(c => c.name === '/spring-api');
  const identity = api?.id || api?.startedAt || 'unknown';
  for (const sample of s.application.loginDiagnostics?.recent || []) {
    loginRecords.set(identity + ':' + sample.diagnosticId, { ...sample, jvmIdentity: identity });
  }
  const diagnosticReads = s.application.loginDiagnostics?.reads;
  if (diagnosticReads) {
    // 느린 요청은 recent에서 밀려나도 slow에서 복구한다. 두 버퍼의 같은 요청은 한 번만 센다.
    for (const sample of [...(diagnosticReads.recent || []), ...(diagnosticReads.slow || [])]) {
      readRecords.set(identity + ':' + sample.diagnosticId, { ...sample, jvmIdentity: identity });
    }
    readRetention.set(identity, { jvmIdentity: identity, enabled: diagnosticReads.enabled,
      completedCount: diagnosticReads.completedCount, recentEvictedCount: diagnosticReads.recentEvictedCount,
      slowEvictedCount: diagnosticReads.slowEvictedCount });
  }
}
const range = values => values.length ? { min: Math.min(...values), max: Math.max(...values) } : null;
// 구버전은 로그인만 보존했다. 새 CSRF 기록을 로그인 성능에 합산하지 않는다.
const loginSamples = [...loginRecords.values()].filter(s => !s.requestKind || s.requestKind === 'LOGIN');
const csrfSamples = [...loginRecords.values()].filter(s => s.requestKind === 'CSRF');
const readSamples = [...readRecords.values()];
const endpoints = Object.fromEntries(['jar_list', 'jar_detail', 'note_list'].map(name => {
  const values = reads.filter(r => r.tags.endpoint === name).map(r => r.value);
  return [name, { count: values.length, p95ms: p95(values) }];
}));
const windows = valid.map(s => {
  const end = Date.parse(s.observedAt), start = end - s.intervalSeconds * 1000;
  const api = s.containers?.find(c => c.name === '/spring-api');
  const identity = api?.id || api?.startedAt || 'unknown';
  const r = reads.filter(x => Date.parse(x.time) > start && Date.parse(x.time) <= end);
  return { at: s.observedAt, readCount: r.length, p95ms: p95(r.map(x => x.value)),
    cpuPercent: s.cpuPercent, heapPercent: 100 * s.application.heap.usedBytes / s.application.heap.maxBytes,
    ioWaitPercent: s.ioWaitPercent, swapInMiBs: s.swapInBytesPerSecond / 1048576,
    swapOutMiBs: s.swapOutBytesPerSecond / 1048576,
    gcDelta: s.gcDelta ?? null, processes: s.processes ?? null,
    loginDiagnosticIds: loginSamples.filter(login => login.jvmIdentity === identity && Date.parse(login.startedAt) <= end
      && Date.parse(login.completedAt) >= start).map(login => login.diagnosticId),
    csrfDiagnosticIds: csrfSamples.filter(csrf => csrf.jvmIdentity === identity && Date.parse(csrf.startedAt) <= end
      && Date.parse(csrf.completedAt) >= start).map(csrf => csrf.diagnosticId),
    readDiagnosticIds: readSamples.filter(read => read.jvmIdentity === identity && Date.parse(read.startedAt) <= end
      && Date.parse(read.completedAt) >= start).map(read => read.diagnosticId) };
});
const result = { scope: 'OBSERVED_READ_TEST_NOT_GENERAL_USER_CAPACITY',
  guardStatus: guard.status, guardReason: guard.reason, loadExitCode: guard.loadExitCode ?? null,
  k6SummaryPresent: fs.existsSync(path.join(folder, 'k6-summary.json')), incompleteMetricLines,
  phaseHttpCounts: phases, endpoints, completedHttpReads: reads.length,
  checkedReads: errors.length, readErrors: errors.reduce((a, b) => a + b, 0),
  readErrorRate: errors.length ? errors.reduce((a, b) => a + b, 0) / errors.length : null,
  cleanupChecks: cleanups.length, cleanupErrors: cleanups.reduce((a, b) => a + b, 0),
  cpuPercent: range(valid.map(s => s.cpuPercent)),
  heapPercent: range(valid.map(s => 100 * s.application.heap.usedBytes / s.application.heap.maxBytes)),
  availableMiB: range(valid.map(s => s.memAvailableBytes / 1048576)),
  ioWaitPercent: range(valid.map(s => s.ioWaitPercent)),
  poolActive: range(valid.flatMap(s => s.application.pools.map(p => p.activeConnections))),
  poolPending: range(valid.flatMap(s => s.application.pools.map(p => p.pendingRequests))),
  loginDiagnosticsEnabled: valid.at(-1)?.application.loginDiagnostics?.enabled ?? null,
  loginSamples, csrfSamples,
  readDiagnosticsEnabled: valid.at(-1)?.application.loginDiagnostics?.reads?.enabled ?? null,
  readSamples, readRetention: [...readRetention.values()],
  windows };
console.log(JSON.stringify(result, null, 2));
