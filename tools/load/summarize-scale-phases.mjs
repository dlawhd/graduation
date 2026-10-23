// 준비·조회·정리의 원본 표본을 분리한다. 준비 실패는 조회 실패/성공으로 바꾸지 않는다.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export function summarizePhases(points, vus, incompleteLines = 0) {
  if (![50, 100, 150, 200, 300].includes(vus)) throw new Error('INVALID_SCALE_STAGE');
  const counts = { preparation_accounts: 0, preparation_ready: 0, preparation_failures: 0 };
  const requests = { prepare: [], read: [], cleanup: [] };
  for (const point of points) {
    if (point.type !== 'Point') continue;
    if (Object.hasOwn(counts, point.metric)) counts[point.metric] += point.data.value;
    if (point.metric !== 'http_req_duration') continue;
    const data = point.data, phase = data.tags?.phase;
    if (!Object.hasOwn(requests, phase)) continue;
    // 허용한 상태·시간·단계만 복사해 쿠키·주소 등 불필요한 정보가 요약에 섞이지 않게 한다.
    requests[phase].push({ at: data.time, elapsedMs: data.value,
      status: data.tags.status, step: phase === 'prepare' ? data.tags.step : undefined });
  }
  const steps = ['CSRF', 'LOGIN', 'ME', 'JAR_LIST'];
  const prepare = requests.prepare;
  const checks = { completeMetrics: incompleteLines === 0,
    accounts: counts.preparation_accounts === vus, ready: counts.preparation_ready === 1,
    noFailureMarker: counts.preparation_failures === 0, requestCount: prepare.length === 4 * vus,
    statuses: prepare.length > 0 && prepare.every(r => r.status === '200'),
    steps: steps.every(step => prepare.filter(r => r.step === step).length === vus) };
  const failed = prepare.find(r => r.status !== '200');
  const read = requests.read;
  const durationMs = read.length ? Math.max(...read.map(r => Date.parse(r.at)))
    - Math.min(...read.map(r => Date.parse(r.at) - r.elapsedMs)) : 0;
  const prepPassed = Object.values(checks).every(Boolean);
  return { schema: 1, vus, incompleteLines,
    preparation: { status: prepPassed ? 'PASSED' : 'FAILED', checks, verifiedAccounts: counts.preparation_accounts,
      requestCount: prepare.length, failedRequest: failed || null,
      steps: Object.fromEntries(steps.map(step => [step, prepare.filter(r => r.step === step)])) },
    reads: { status: !read.length ? 'NOT_STARTED' : prepPassed ? 'EXECUTED_PENDING_VALIDATION' : 'INVALID_PREPARATION',
      completedRequests: read.length, observedDurationMs: durationMs },
    cleanup: { requestCount: requests.cleanup.length,
      failedRequests: requests.cleanup.filter(r => r.status !== '200').length } };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const folder = process.argv[2], vus = Number(process.argv[3]);
  const lines = fs.readFileSync(path.join(folder, 'k6-metrics.jsonl'), 'utf8').split(/\r?\n/).filter(Boolean);
  let incomplete = 0;
  const points = [];
  for (const line of lines) {
    try { points.push(JSON.parse(line)); } catch { incomplete++; }
  }
  console.log(JSON.stringify(summarizePhases(points, vus, incomplete)));
}
