// 상위 단계도 실제 통신 없이 VU별 계정·묶음 격리·호출 범위·k6 호환성을 검사한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validateScale, resolveScaleTimeout } from './read-scale-policy.mjs';
import { operation, readThresholds, validResponse } from './read-contract.mjs';

const baseUrl = 'https://api.esjh.shop';
function family() {
  return { schema: 2, scope: 'ec2-grouped-read', groups: Array.from({ length: 30 }, (_, g) => {
    const prefix = 'lt' + g.toString(16).padStart(8, '0');
    return { schema: 1, scope: 'ec2-prepared', runId: prefix, pageSize: 20, notesPerJar: 40,
      accounts: Array.from({ length: 10 }, (_, i) => ({ userId: g * 10 + i + 1,
        loginId: prefix + i, password: 'fake-only-password' })),
      jars: Array.from({ length: 3 }, (_, j) => ({ jarId: g * 3 + j + 1,
        ownerId: g * 10 + j + 1, name: prefix + '-jar-' + j,
        noteIds: Array.from({ length: 40 }, (_, n) => g * 120 + j * 40 + 40 - n) })) };
  }) };
}

test('명시한 단계·승인·주소·전용 묶음을 요구한다', () => {
  const f = family();
  for (const stage of ['50', '100', '200', '300']) {
    assert.equal(validateScale(f, baseUrl, stage, stage + 'VU_60S_WITH_GUARD').length, Number(stage) / 10);
  }
  for (const stage of ['10', '49', '500', '', '50;']) {
    assert.throws(() => validateScale(f, baseUrl, stage, stage + 'VU_60S_WITH_GUARD'));
  }
  assert.throws(() => validateScale(f, baseUrl + '/', '50', '50VU_60S_WITH_GUARD'));
  assert.throws(() => validateScale(f, baseUrl, '50', '300VU_60S_WITH_GUARD'));
});

test('묶음 사이 계정·저금통·쪽지 공유나 잘못된 범위를 거절한다', () => {
  for (const mutate of [f => { f.groups[1].accounts[0].userId = 1; },
    f => { f.groups[1].jars[0].jarId = 1; },
    f => { f.groups[1].jars[0].noteIds[0] = 1; },
    f => { f.groups[0].scope = 'production'; }, f => f.groups.pop()]) {
    const f = family(); mutate(f);
    assert.throws(() => validateScale(f, baseUrl, '50', '50VU_60S_WITH_GUARD'));
  }
});

function harness(stage, fault, approval = stage + 'VU_60S_WITH_GUARD', latencyTarget) {
  const f = family(), calls = [], metrics = {};
  class Jar {
    constructor() { this.values = {}; }
    set(_, name, value) { this.values[name] = [value]; }
    cookiesForURL() { return this.values; }
  }
  class Metric {
    constructor(name) { this.name = name; metrics[name] = []; }
    add(value, tags) { metrics[this.name].push({ value, tags }); }
  }
  const response = data => ({ status: 200, body: JSON.stringify({ data }) });
  function request(method, url, body, p) {
    assert.equal(p.timeout, approval.endsWith('VU_60S_5S_WITH_GUARD') ? '5s' : '3s'); assert.equal(p.redirects, 0);
    assert.ok(url.startsWith(baseUrl + '/api/v1/'));
    const route = url.slice(baseUrl.length); calls.push({ method, route, phase: p.tags.phase });
    if (route === '/api/v1/csrf') return response({ headerName: 'X-XSRF-TOKEN', token: 'fake-csrf' });
    if (route === '/api/v1/auth/login') {
      assert.equal(method, 'POST');
      const account = f.groups.flatMap(g => g.accounts).find(a => a.loginId === JSON.parse(body).loginId);
      p.jar.set(baseUrl, 'accessToken', String(account.userId)); p.jar.set(baseUrl, 'refreshToken', 'fake-refresh');
      return response({ userId: account.userId });
    }
    if (route === '/api/v1/auth/logout') {
      assert.equal(method, 'POST');
      assert.equal(p.headers['X-XSRF-TOKEN'], 'fake-csrf');
      return fault === 'cleanup' ? { status: 500 } : response({ ok: true });
    }
    assert.equal(method, 'GET');
    const user = Number(p.cookies ? p.cookies.accessToken : p.jar.values.accessToken[0]);
    if (route === '/api/v1/me') return fault === 'prepare-timeout' && user === 2
      ? { status: 0, body: '' } : response({ userId: user });
    if (fault === 'setup' && p.tags.phase === 'prepare' && user === 23) return { status: 500 };
    if (fault === 'read' && p.tags.phase === 'read') return response(null);
    const group = f.groups[Math.floor((user - 1) / 10)];
    const item = jar => ({ jarId: jar.jarId, ownerId: jar.ownerId, name: jar.name,
      isOpen: true, myRole: jar.ownerId === user ? 'OWNER' : 'MEMBER', memberCount: 10,
      maxMembers: 10, design: null, openMode: 'ALL_AT_ONCE' });
    if (route === '/api/v1/jars?page=0&size=20') return response({ page: 0, size: 20,
      totalElements: 3, totalPages: 1, items: group.jars.map(item) });
    const match = /^\/api\/v1\/jars\/(\d+)(?:\/notes\?page=([01])&size=20)?$/.exec(route);
    assert.ok(match);
    const jar = group.jars.find(j => j.jarId === Number(match[1]));
    assert.ok(jar, 'VU가 다른 묶음의 저금통을 조회하면 안 된다');
    if (match[2] === undefined) return response(item(jar));
    const page = Number(match[2]);
    return response({ page, size: 20, totalElements: 40, totalPages: 2,
      items: jar.noteIds.slice(page * 20, (page + 1) * 20).map(noteId => ({ noteId,
        authorId: group.accounts[0].userId, title: group.runId + '-note-1', previewContent: 'fake',
        isEncrypted: false, attachments: [], reactionCounts: [], myReaction: null, commentCount: 0 })) });
  }
  const context = vm.createContext({ __ENV: { BASE_URL: baseUrl, FAMILY_PATH: 'fake', SCALE_VUS: stage,
      SCALE_APPROVAL: approval, READ_P95_TARGET_MS: latencyTarget }, __VU: 1, __ITER: 0,
    open: () => JSON.stringify(f), validateScale, resolveScaleTimeout, operation, readThresholds, validResponse,
    http: { CookieJar: Jar, get: (u, p) => request('GET', u, null, p),
      post: (u, b, p) => request('POST', u, b, p) },
    sleep: () => {}, check: (_, checks) => Object.values(checks).every(fn => fn()), Rate: Metric, Counter: Metric });
  const source = fs.readFileSync(new URL('./read-scale.js', import.meta.url), 'utf8')
    .replace(/^import .*;\r?\n/gm, '').replace('export default function (', 'function iteration(').replace(/export /g, '');
  vm.runInContext(source + '\n globalThis.api = { options, setup, iteration, teardown };', context);
  return { api: context.api, context, calls, metrics };
}

test('임시 2000ms를 선택해도 50·100 VU의 5초 요청 제한·계정 분리·정리는 유지한다', () => {
  for (const count of ['50', '100']) {
    const h = harness(count, undefined, count + 'VU_60S_5S_WITH_GUARD', '2000');
    const sessions = h.api.setup();
    h.api.iteration(sessions);
    h.api.teardown(sessions);
    assert.equal(sessions.length, Number(count));
    assert.equal(h.api.options.thresholds['http_req_duration{phase:read,endpoint:note_list}'][0].threshold, 'p(95)<=2000');
    assert.ok(h.metrics.cleanup_errors.every(m => !m.value));
  }
  for (const count of ['50', '100']) {
    const h = harness(count, undefined, count + 'VU_60S_5S_WITH_GUARD', '5000');
    assert.equal(h.api.options.thresholds['http_req_duration{phase:read,endpoint:note_list}'][0].threshold, 'p(95)<=5000');
  }
  assert.throws(() => harness('50', undefined, '50VU_60S_5S_WITH_GUARD', '10000'));
});

test('50·100·200·300 VU마다 다른 계정과 자기 묶음을 사용하고 모두 정리한다', () => {
  for (const stage of ['50', '100', '200', '300']) {
    const h = harness(stage), sessions = h.api.setup();
    assert.equal(sessions.length, Number(stage));
    assert.equal(new Set(sessions.map(s => s.userId)).size, Number(stage));
    for (let vu = 1; vu <= Number(stage); vu++) {
      h.context.__VU = vu;
      for (let i = 0; i < 20; i++) { h.context.__ITER = i; h.api.iteration(sessions); }
    }
    assert.equal(h.metrics.read_requests.length, Number(stage) * 20);
    assert.ok(h.metrics.read_errors.every(m => !m.value));
    h.api.teardown(sessions);
    assert.equal(h.metrics.cleanup_errors.length, Number(stage));
    assert.ok(h.metrics.cleanup_errors.every(m => !m.value));
  }
});

test('중간 인증 실패·잘못된 조회·정리 실패는 성공으로 누락시키지 않는다', () => {
  const h = harness('50', 'setup');
  assert.throws(() => h.api.setup(), /SCALE_SETUP_FAILED/);
  assert.equal(h.metrics.cleanup_errors.length, 23); assert.equal(h.metrics.read_requests.length, 0);
  assert.equal(h.metrics.preparation_accounts.length, 22);
  assert.equal(h.metrics.preparation_ready.length, 0);
  assert.equal(h.metrics.preparation_failures.length, 1);
  const bad = harness('50', 'read'), sessions = bad.api.setup();
  bad.api.iteration(sessions); assert.equal(bad.metrics.read_errors[0].value, true);
  const cleanup = harness('50', 'cleanup'); cleanup.api.teardown(cleanup.api.setup());
  assert.ok(cleanup.metrics.cleanup_errors.every(m => m.value));
});

test('두 번째 계정의 내 정보 시간 초과는 준비 실패로 끝내고 조회하지 않는다', () => {
  const h = harness('50', 'prepare-timeout', '50VU_60S_5S_WITH_GUARD', '5000');
  assert.throws(() => h.api.setup(), /SCALE_SETUP_FAILED/);
  assert.equal(h.metrics.preparation_accounts.length, 1);
  assert.equal(h.metrics.preparation_ready.length, 0);
  assert.equal(h.metrics.preparation_failures.length, 1);
  assert.equal(h.metrics.read_requests.length, 0);
  assert.equal(h.metrics.cleanup_errors.length, 2);
});

test('승인한 50→100→150→200→300의 5초 모드와 별도 준비 표식을 검증한다', () => {
  for (const stage of ['50', '100', '150', '200', '300']) {
    const h = harness(stage, undefined, stage + 'VU_60S_5S_WITH_GUARD'), sessions = h.api.setup();
    assert.equal(sessions.length, Number(stage));
    assert.equal(new Set(sessions.map(s => s.userId)).size, Number(stage));
    for (let vu = 1; vu <= Number(stage); vu++) { h.context.__VU = vu; h.api.iteration(sessions); }
    h.api.teardown(sessions);
    assert.equal(h.metrics.read_requests.length, Number(stage));
    assert.equal(h.metrics.cleanup_errors.length, Number(stage));
    assert.ok(h.metrics.cleanup_errors.every(m => !m.value));
    assert.equal(h.metrics.preparation_accounts.length, Number(stage));
    assert.equal(h.metrics.preparation_ready.length, 1);
    assert.equal(h.metrics.preparation_failures.length, 0);
    assert.equal(h.api.options.scenarios['ec2_read_' + stage].gracefulStop, '5s');
    assert.equal(JSON.stringify(h.api.options.thresholds), JSON.stringify(harness('50').api.options.thresholds));
  }
  assert.throws(() => validateScale(family(), baseUrl, '100', '50VU_60S_5S_WITH_GUARD'));
  for (const stage of ['125', '250', '400']) {
    assert.throws(() => validateScale(family(), baseUrl, stage, stage + 'VU_60S_5S_WITH_GUARD'));
  }
});

test('실제 k6에서 네트워크 없이 각 단계 옵션을 해석한다', () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'memoryjar-scale-inspect-'));
  try {
    const manifest = path.join(folder, 'fake.json'); fs.writeFileSync(manifest, JSON.stringify(family()));
    for (const stage of ['50', '100', '200', '300']) {
      const r = spawnSync('k6', ['inspect', '--env', 'BASE_URL=' + baseUrl, '--env', 'FAMILY_PATH=' + manifest,
        '--env', 'SCALE_VUS=' + stage, '--env', 'SCALE_APPROVAL=' + stage + 'VU_60S_WITH_GUARD',
        fileURLToPath(new URL('./read-scale.js', import.meta.url))], { encoding: 'utf8', timeout: 15000 });
      assert.equal(r.status, 0, 'k6 init failed');
      const options = JSON.parse(r.stdout);
      assert.equal(options.scenarios['ec2_read_' + stage].vus, Number(stage));
      assert.equal(options.scenarios['ec2_read_' + stage].duration, '1m0s');
    }
    for (const stage of ['50', '100', '150', '200', '300']) {
      const r = spawnSync('k6', ['inspect', '--env', 'BASE_URL=' + baseUrl, '--env', 'FAMILY_PATH=' + manifest,
        '--env', 'SCALE_VUS=' + stage, '--env', 'SCALE_APPROVAL=' + stage + 'VU_60S_5S_WITH_GUARD',
        '--env', 'READ_P95_TARGET_MS=5000',
        fileURLToPath(new URL('./read-scale.js', import.meta.url))], { encoding: 'utf8', timeout: 15000 });
      assert.equal(r.status, 0, '실제 k6 50·100 VU·5초 옵션 해석 실패');
      const value = JSON.parse(r.stdout);
      assert.equal(value.scenarios['ec2_read_' + stage].vus, Number(stage));
      assert.equal(value.scenarios['ec2_read_' + stage].duration, '1m0s');
      assert.equal(value.scenarios['ec2_read_' + stage].gracefulStop, '5s');
      assert.equal(value.thresholds['http_req_duration{phase:read,endpoint:jar_list}'][0].threshold, 'p(95)<=5000');
    }
  } finally { fs.rmSync(folder, { recursive: true }); }
});
