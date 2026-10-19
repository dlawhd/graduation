// 실제 네트워크 대신 HTTP·k6 API 대역으로 운영 시나리오의 범위와 계정 분리를 검사한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validateEc2Read, resolveEc2ReadProfile } from './read-ec2-policy.mjs';
import { operation, readThresholds, validResponse } from './read-contract.mjs';

const baseUrl = 'https://api.esjh.shop';
function fixture() {
  return { schema: 1, scope: 'ec2-prepared', runId: 'ltabcdef12', pageSize: 20, notesPerJar: 40,
    accounts: Array.from({ length: 10 }, (_, i) => ({ userId: i + 1,
      loginId: 'ltabcdef12' + i, password: 'mock-only-password' })),
    jars: Array.from({ length: 3 }, (_, i) => ({ jarId: i + 1, ownerId: i + 1,
      name: 'ltabcdef12-jar-' + i, noteIds: Array.from({ length: 40 }, (_, n) => i * 40 + 40 - n) })) };
}

function harness(fault, approval = '10VU_60S_WITH_GUARD') {
  const f = fixture(), calls = [], waits = [], metrics = {};
  let logged = 0;
  class CookieJar {
    constructor() { this.values = {}; }
    set(_, name, value) { this.values[name] = [value]; }
    cookiesForURL() { return this.values; }
  }
  class Metric {
    constructor(name) { this.name = name; metrics[name] = []; }
    add(value, tags) { metrics[this.name].push({ value, tags }); }
  }
  const result = data => ({ status: 200, body: JSON.stringify({ data }) });
  function request(method, url, body, params) {
    assert.equal(params.redirects, 0);
    assert.equal(params.timeout, ['4ACCOUNTS_5S_PREPARE_ONLY_WITH_GUARD',
      '10ACCOUNTS_5S_PREPARE_ONLY_WITH_GUARD', '10VU_60S_5S_WITH_GUARD'].includes(approval) ? '5s' : '3s');
    assert.ok(url.startsWith(baseUrl + '/api/v1/'));
    const path = url.slice(baseUrl.length);
    calls.push({ method, path, phase: params.tags.phase });
    const user = params.cookies ? Number(params.cookies.accessToken)
      : Number((params.jar.values.accessToken || ['1'])[0]);
    if (path === '/api/v1/csrf') return result({ headerName: 'X-XSRF-TOKEN', token: 'fake-csrf' });
    if (path === '/api/v1/auth/login') {
      assert.equal(method, 'POST');
      const account = f.accounts.find(a => a.loginId === JSON.parse(body).loginId);
      logged++;
      params.jar.set(baseUrl, 'accessToken', String(account.userId));
      params.jar.set(baseUrl, 'refreshToken', 'fake-refresh');
      return result({ userId: account.userId });
    }
    if (path === '/api/v1/auth/logout') {
      assert.equal(method, 'POST');
      assert.equal(params.headers['X-XSRF-TOKEN'], 'fake-csrf');
      return fault === 'cleanup' ? { status: 500 } : result({ ok: true });
    }
    assert.equal(method, 'GET');
    if (path === '/api/v1/me') return result({ userId: user });
    if (fault === 'setup' && params.tags.phase === 'prepare' && logged === 3) return { status: 500 };
    if (fault === 'read' && params.tags.phase === 'read') return result(null);
    const jarItem = jar => ({ jarId: jar.jarId, name: jar.name, ownerId: jar.ownerId,
      myRole: jar.ownerId === user ? 'OWNER' : 'MEMBER', memberCount: 10, maxMembers: 10,
      isOpen: true, design: null, openMode: 'ALL_AT_ONCE' });
    if (path === '/api/v1/jars?page=0&size=20') return result({ page: 0, size: 20,
      totalElements: 3, totalPages: 1, items: f.jars.map(jarItem) });
    const match = /^\/api\/v1\/jars\/([1-3])(?:\/notes\?page=([01])&size=20)?$/.exec(path);
    assert.ok(match, '허용한 세 조회 경로만 호출해야 한다');
    const jar = f.jars[Number(match[1]) - 1];
    if (match[2] === undefined) return result(jarItem(jar));
    const page = Number(match[2]);
    return result({ page, size: 20, totalElements: 40, totalPages: 2,
      items: jar.noteIds.slice(page * 20, (page + 1) * 20).map(noteId => ({ noteId,
        authorId: 1, title: f.runId + '-note-1', previewContent: 'fake', isEncrypted: false,
        attachments: [], reactionCounts: [], myReaction: null, commentCount: 0 })) });
  }
  const context = vm.createContext({ __ENV: { BASE_URL: baseUrl, FIXTURE_PATH: 'fake',
      EC2_READ_APPROVAL: approval }, __VU: 1, __ITER: 0,
    open: () => JSON.stringify(f), operation, readThresholds, validResponse, resolveEc2ReadProfile,
    http: { CookieJar, get: (url, p) => request('GET', url, null, p),
      post: (url, body, p) => request('POST', url, body, p) },
    check: (_, checks) => Object.values(checks).every(fn => fn()), sleep: n => waits.push(n),
    Rate: Metric, Counter: Metric });
  // k6 전용 import만 대역으로 바꾼다. 실제 시나리오의 함수 본문은 그대로 실행한다.
  const source = fs.readFileSync(new URL('./read-ec2.js', import.meta.url), 'utf8')
    .replace(/^import .*;\r?\n/gm, '').replace('export default function (', 'function iteration(')
    .replace(/export /g, '');
  vm.runInContext(source + '\n globalThis.api = { options, setup, iteration, teardown };', context);
  return { context, api: context.api, calls, waits, metrics };
}

test('명시 승인·정확한 HTTPS 주소·운영 전용 fixture 없이는 거절한다', () => {
  validateEc2Read(fixture(), baseUrl, '10VU_60S_WITH_GUARD');
  for (const approval of ['', undefined, '1']) assert.throws(() => validateEc2Read(fixture(), baseUrl, approval));
  for (const url of ['http://api.esjh.shop', baseUrl + '/', baseUrl + '@evil.example', 'http://127.0.0.1:8080']) {
    assert.throws(() => validateEc2Read(fixture(), url, '10VU_60S_WITH_GUARD'));
  }
  const f = fixture(); f.scope = 'isolated-local';
  assert.throws(() => validateEc2Read(f, baseUrl, '10VU_60S_WITH_GUARD'));
});

test('30분 지속 시험은 별도 명시 승인만 허용하고 기존 안전 기준을 유지한다', () => {
  assert.equal(validateEc2Read(fixture(), baseUrl, '10VU_1800S_WITH_GUARD'), '1800s');
  for (const approval of ['10VU_1500S_WITH_GUARD', '50VU_1800S_WITH_GUARD', '10VU_1800S']) {
    assert.throws(() => validateEc2Read(fixture(), baseUrl, approval));
  }
  const normal = harness(), soak = harness(undefined, '10VU_1800S_WITH_GUARD');
  assert.equal(soak.api.options.scenarios.ec2_read_10.vus, 10);
  assert.equal(soak.api.options.scenarios.ec2_read_10.duration, '1800s');
  assert.equal(JSON.stringify(soak.api.options.thresholds), JSON.stringify(normal.api.options.thresholds));
  assert.equal(soak.api.options.setupTimeout, '120s');
  assert.equal(soak.api.options.teardownTimeout, '90s');
  const sessions = soak.api.setup();
  soak.api.iteration(sessions);
  soak.api.teardown(sessions);
  assert.equal(soak.metrics.read_errors[0].value, false);
  assert.ok(soak.metrics.cleanup_errors.every(m => !m.value));
});

test('5초 진단은 정확한 승인으로 4계정 준비·정리만 수행하고 반복 조회를 보내지 않는다', () => {
  const approval = '4ACCOUNTS_5S_PREPARE_ONLY_WITH_GUARD';
  assert.throws(() => resolveEc2ReadProfile(fixture(), 'https://other.example', approval));
  assert.throws(() => resolveEc2ReadProfile(fixture(), baseUrl, '10VU_5S_WITH_GUARD'));
  const h = harness(undefined, approval), sessions = h.api.setup();
  assert.equal(sessions.length, 4);
  assert.equal(h.calls.length, 16);
  assert.equal(h.api.options.scenarios.preparation_only.vus, 1);
  assert.equal(h.api.options.scenarios.preparation_only.iterations, 1);
  h.api.iteration(sessions);
  assert.equal(h.calls.length, 16);
  assert.equal(h.metrics.read_requests.length, 0);
  h.api.teardown(sessions);
  assert.equal(h.calls.length, 24);
  assert.equal(h.metrics.cleanup_errors.length, 4);
  assert.ok(h.metrics.cleanup_errors.every(m => !m.value));
  const failed = harness('setup', approval);
  assert.throws(() => failed.api.setup(), /EC2_SETUP_FAILED/);
  assert.equal(failed.metrics.cleanup_errors.length, 3);
  assert.equal(failed.metrics.read_requests.length, 0);
});

test('10개 계정을 순차 인증하고 각 VU 조회·1초 대기·세션 정리를 분리한다', () => {
  const h = harness(), sessions = h.api.setup();
  assert.equal(sessions.length, 10);
  assert.equal(h.api.options.scenarios.ec2_read_10.vus, 10);
  assert.equal(h.api.options.scenarios.ec2_read_10.duration, '60s');
  assert.equal(h.calls.length, 40);
  for (let vu = 1; vu <= 10; vu++) {
    h.context.__VU = vu;
    for (let i = 0; i < 20; i++) { h.context.__ITER = i; h.api.iteration(sessions); }
  }
  assert.equal(h.metrics.read_requests.length, 200);
  assert.ok(h.metrics.read_errors.every(m => m.value === false));
  assert.equal(h.waits.filter(n => n === 1).length, 200);
  assert.deepEqual(Object.fromEntries(['jar_list', 'jar_detail', 'note_list'].map(name =>
    [name, h.metrics.read_requests.filter(m => m.tags.endpoint === name).length])),
  { jar_list: 60, jar_detail: 60, note_list: 80 });
  h.api.teardown(sessions);
  assert.equal(h.metrics.cleanup_errors.length, 10);
  assert.ok(h.metrics.cleanup_errors.every(m => !m.value));
  assert.equal(h.calls.filter(c => c.phase === 'cleanup').length, 20);
});

test('10계정 5초 준비와 10 VU 5초 조회를 별도 승인으로 구분하고 성능 목표는 유지한다', () => {
  const prepared = harness(undefined, '10ACCOUNTS_5S_PREPARE_ONLY_WITH_GUARD');
  const sessions = prepared.api.setup();
  assert.equal(sessions.length, 10);
  prepared.api.iteration(sessions);
  assert.equal(prepared.calls.length, 40);
  assert.equal(prepared.metrics.read_requests.length, 0);
  prepared.api.teardown(sessions);
  assert.equal(prepared.calls.length, 60);
  assert.equal(prepared.metrics.cleanup_errors.length, 10);
  const load = harness(undefined, '10VU_60S_5S_WITH_GUARD');
  const loaded = load.api.setup();
  for (let vu = 1; vu <= 10; vu++) { load.context.__VU = vu; load.api.iteration(loaded); }
  load.api.teardown(loaded);
  assert.equal(load.metrics.read_requests.length, 10);
  assert.equal(load.api.options.scenarios.ec2_read_10.gracefulStop, '5s');
  assert.equal(load.api.options.scenarios.ec2_read_10.duration, '60s');
  assert.equal(JSON.stringify(load.api.options.thresholds), JSON.stringify(harness().api.options.thresholds));
  for (const approval of ['50VU_60S_5S_WITH_GUARD', '10VU_1800S_5S_WITH_GUARD', '50ACCOUNTS_5S_PREPARE_ONLY_WITH_GUARD']) {
    assert.throws(() => resolveEc2ReadProfile(fixture(), baseUrl, approval));
  }
});

test('인증 중간 실패 시 이미 로그인한 계정만 정리하고 조회를 시작하지 않는다', () => {
  const h = harness('setup');
  assert.throws(() => h.api.setup(), /EC2_SETUP_FAILED/);
  assert.equal(h.metrics.read_requests.length, 0);
  assert.equal(h.metrics.cleanup_errors.length, 3);
});

test('잘못된 조회 본문과 정리 실패는 성공 표본으로 바꾸지 않는다', () => {
  const h = harness('read'), sessions = h.api.setup();
  h.api.iteration(sessions);
  assert.equal(h.metrics.read_errors[0].value, true);
  const bad = harness('cleanup'), other = bad.api.setup();
  bad.api.teardown(other);
  assert.ok(bad.metrics.cleanup_errors.every(m => m.value));
});

test('설치된 실제 k6가 외부 요청 없이 10 VU·60초와 30분 옵션을 해석한다', () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'memoryjar-ec2-inspect-'));
  try {
    const manifest = path.join(folder, 'fake-fixture.json');
    fs.writeFileSync(manifest, JSON.stringify(fixture()));
    // inspect는 init/options만 실행하며 setup·default·teardown HTTP를 실행하지 않는다.
    const result = spawnSync('k6', ['inspect', '--env', 'BASE_URL=' + baseUrl,
      '--env', 'FIXTURE_PATH=' + manifest, '--env', 'EC2_READ_APPROVAL=10VU_60S_WITH_GUARD',
      fileURLToPath(new URL('./read-ec2.js', import.meta.url))], { encoding: 'utf8', timeout: 15000 });
    assert.equal(result.status, 0, '실제 k6 옵션 해석 실패');
    const options = JSON.parse(result.stdout);
    assert.equal(options.scenarios.ec2_read_10.vus, 10);
    assert.equal(options.scenarios.ec2_read_10.duration, '1m0s');
    assert.ok(options.thresholds['http_req_duration{phase:read,endpoint:jar_detail}']);
    const soak = spawnSync('k6', ['inspect', '--env', 'BASE_URL=' + baseUrl,
      '--env', 'FIXTURE_PATH=' + manifest, '--env', 'EC2_READ_APPROVAL=10VU_1800S_WITH_GUARD',
      fileURLToPath(new URL('./read-ec2.js', import.meta.url))], { encoding: 'utf8', timeout: 15000 });
    assert.equal(soak.status, 0, '실제 k6 지속 시험 옵션 해석 실패');
    const soakOptions = JSON.parse(soak.stdout);
    assert.equal(soakOptions.scenarios.ec2_read_10.vus, 10);
    assert.equal(soakOptions.scenarios.ec2_read_10.duration, '30m0s');
    const diagnostic = spawnSync('k6', ['inspect', '--env', 'BASE_URL=' + baseUrl,
      '--env', 'FIXTURE_PATH=' + manifest, '--env', 'EC2_READ_APPROVAL=4ACCOUNTS_5S_PREPARE_ONLY_WITH_GUARD',
      fileURLToPath(new URL('./read-ec2.js', import.meta.url))], { encoding: 'utf8', timeout: 15000 });
    assert.equal(diagnostic.status, 0, '실제 k6 준비 전용 옵션 해석 실패');
    const diagnosticOptions = JSON.parse(diagnostic.stdout);
    assert.equal(diagnosticOptions.scenarios.preparation_only.vus, 1);
    assert.equal(diagnosticOptions.scenarios.preparation_only.iterations, 1);
    assert.equal(diagnosticOptions.scenarios.ec2_read_10, undefined);
    for (const approval of ['10ACCOUNTS_5S_PREPARE_ONLY_WITH_GUARD', '10VU_60S_5S_WITH_GUARD']) {
      const r = spawnSync('k6', ['inspect', '--env', 'BASE_URL=' + baseUrl,
        '--env', 'FIXTURE_PATH=' + manifest, '--env', 'EC2_READ_APPROVAL=' + approval,
        fileURLToPath(new URL('./read-ec2.js', import.meta.url))], { encoding: 'utf8', timeout: 15000 });
      assert.equal(r.status, 0, '실제 k6 후속 5초 단계 옵션 해석 실패');
      const value = JSON.parse(r.stdout);
      if (approval.startsWith('10VU')) {
        assert.equal(value.scenarios.ec2_read_10.vus, 10);
        assert.equal(value.scenarios.ec2_read_10.duration, '1m0s');
        assert.equal(value.scenarios.ec2_read_10.gracefulStop, '5s');
      } else assert.equal(value.scenarios.preparation_only.iterations, 1);
    }
  } finally {
    // 이 테스트가 방금 만든 임시 폴더만 제거한다. 실제 fixture에는 접근하지 않는다.
    fs.rmSync(folder, { recursive: true });
  }
});
