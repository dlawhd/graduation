// 운영 조회 50→300 VU 전용. VU당 별도 계정과 검증한 묶음만 사용하고 단계별 감시기 아래 실행한다.
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Counter } from 'k6/metrics';
import { operation, readThresholds, validResponse } from './read-contract.mjs';
import { validateScale } from './read-scale-policy.mjs';

const baseUrl = __ENV.BASE_URL || '';
if (!__ENV.FAMILY_PATH) throw new Error('FAMILY_PATH_REQUIRED');
const family = JSON.parse(open(__ENV.FAMILY_PATH));
const groups = validateScale(family, baseUrl, __ENV.SCALE_VUS, __ENV.SCALE_APPROVAL);
const vus = Number(__ENV.SCALE_VUS);
const readErrors = new Rate('read_errors'), readRequests = new Counter('read_requests');
const cleanupErrors = new Rate('cleanup_errors');
const scenarios = {};
scenarios['ec2_read_' + vus] = { executor: 'constant-vus', vus, duration: '60s', gracefulStop: '3s' };
export const options = { scenarios, setupTimeout: '20m', teardownTimeout: '15m', maxRedirects: 0,
  systemTags: ['status', 'method', 'name', 'scenario', 'expected_response'],
  thresholds: Object.assign(readThresholds(), { cleanup_errors: ['rate==0'] }) };

function data(response) {
  if (response.status !== 200) throw new Error('PREPARATION_HTTP_FAILED');
  try { return JSON.parse(response.body).data; } catch (_) { throw new Error('PREPARATION_JSON_FAILED'); }
}

function get(path, params) {
  sleep(0.5);
  return http.get(baseUrl + path, params);
}

function closeSession(session) {
  const jar = new http.CookieJar();
  const params = { jar, redirects: 0, timeout: '3s', tags: { phase: 'cleanup', name: 'cleanup' } };
  try {
    Object.keys(session.cookies).forEach(name => jar.set(baseUrl, name, session.cookies[name][0], { path: '/' }));
    const csrf = data(get('/api/v1/csrf', params));
    if (!csrf || csrf.headerName !== 'X-XSRF-TOKEN' || !csrf.token) throw new Error('INVALID_CSRF');
    params.headers = { 'X-XSRF-TOKEN': csrf.token };
    sleep(0.5);
    cleanupErrors.add(data(http.post(baseUrl + '/api/v1/auth/logout', null, params)).ok !== true);
  } catch (_) { cleanupErrors.add(true); }
}

export function setup() {
  const sessions = [];
  try {
    groups.forEach((group, groupIndex) => group.accounts.forEach(account => {
      const jar = new http.CookieJar();
      const params = { jar, redirects: 0, timeout: '3s', tags: { phase: 'prepare', name: 'prepare' } };
      const csrf = data(get('/api/v1/csrf', params));
      if (!csrf || csrf.headerName !== 'X-XSRF-TOKEN' || !csrf.token) throw new Error('INVALID_CSRF');
      params.headers = { 'Content-Type': 'application/json', 'X-XSRF-TOKEN': csrf.token };
      sleep(0.5);
      const login = data(http.post(baseUrl + '/api/v1/auth/login', JSON.stringify({
        loginId: account.loginId, password: account.password }), params));
      const cookies = jar.cookiesForURL(baseUrl + '/api/v1/me');
      sessions.push({ groupIndex, userId: account.userId, cookies });
      if (login.userId !== account.userId || !cookies.accessToken || !cookies.refreshToken) throw new Error('INVALID_LOGIN');
      if (data(get('/api/v1/me', params)).userId !== account.userId) throw new Error('INVALID_ME');
      const listed = get('/api/v1/jars?page=0&size=20', params);
      if (!validResponse(listed.status, listed.body, { endpoint: 'jar_list' }, group, account.userId)) {
        throw new Error('INVALID_MEMBERSHIP');
      }
    }));
    return sessions;
  } catch (_) {
    sessions.forEach(closeSession);
    throw new Error('SCALE_SETUP_FAILED_CHECK_SCOPED_SESSIONS');
  }
}

export default function (sessions) {
  const session = sessions[__VU - 1];
  if (!session || sessions.length !== vus) throw new Error('DEDICATED_ACCOUNT_REQUIRED');
  const group = groups[session.groupIndex];
  const op = operation(__ITER, __VU, group);
  const response = http.get(baseUrl + op.path, {
    cookies: { accessToken: session.cookies.accessToken[0] }, redirects: 0, timeout: '3s',
    tags: { phase: 'read', endpoint: op.endpoint, name: op.endpoint },
  });
  const correct = validResponse(response.status, response.body, op, group, session.userId);
  check(response, { 'status and fixture data match': () => correct }, { endpoint: op.endpoint });
  readErrors.add(!correct); readRequests.add(1, { endpoint: op.endpoint });
  sleep(1);
}

export function teardown(sessions) {
  // 강제 중단 시 실행되지 않을 수 있다. 남은 시험 세션은 묶음별 전용 범위에서만 정리한다.
  (sessions || []).forEach(closeSession);
}
