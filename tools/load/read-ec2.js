// 승인한 운영 조회 10 VU 전용이다. 기존 감시기의 소유 자식으로만 실행하고 비용 경로는 호출하지 않는다.
// 별도 5초 진단 승인은 4계정의 준비·정리만 수행하며 반복 조회는 실행하지 않는다.
// 후속 10계정 준비와 10 VU·5초 조회도 각각 구분된 승인값으로만 실행한다.
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Counter } from 'k6/metrics';
import { operation, readThresholds, validResponse } from './read-contract.mjs';
import { resolveEc2ReadProfile } from './read-ec2-policy.mjs';

const baseUrl = __ENV.BASE_URL || '';
if (!__ENV.FIXTURE_PATH) throw new Error('EC2_FIXTURE_PATH_REQUIRED');
const fixture = JSON.parse(open(__ENV.FIXTURE_PATH));
const profile = resolveEc2ReadProfile(fixture, baseUrl, __ENV.EC2_READ_APPROVAL);
const readErrors = new Rate('read_errors');
const readRequests = new Counter('read_requests');
const cleanupErrors = new Rate('cleanup_errors');

export const options = {
  scenarios: profile.preparationOnly
    ? { preparation_only: { executor: 'shared-iterations', vus: 1, iterations: 1, maxDuration: '5s' } }
    : { ec2_read_10: { executor: 'constant-vus', vus: 10, duration: profile.duration, gracefulStop: profile.timeout } },
  setupTimeout: '120s', teardownTimeout: '90s', maxRedirects: 0,
  // URL·쿠키를 시계열 태그에 남기지 않고 API 이름으로 집계한다.
  systemTags: ['status', 'method', 'name', 'scenario', 'expected_response'],
  // 준비 전용에서는 조회를 보내지 않는다. 500ms 목표를 완화하는 대신 성능 합격 판정 자체를 하지 않는다.
  thresholds: profile.preparationOnly
    ? { 'http_req_failed{phase:prepare}': ['rate==0'], cleanup_errors: ['rate==0'] }
    : Object.assign(readThresholds(), { cleanup_errors: ['rate==0'] }),
};

function data(response) {
  if (response.status !== 200) throw new Error('EC2_PREPARATION_HTTP_FAILED');
  try { return JSON.parse(response.body).data; } catch (_) { throw new Error('EC2_PREPARATION_JSON_FAILED'); }
}

// 인증 준비와 세션 정리는 조회 성능에서 제외하되, 자원 감시 중에 수행한다.
function prepareGet(path, params) {
  sleep(0.5);
  return http.get(baseUrl + path, params);
}

function closeSession(session) {
  const jar = new http.CookieJar();
  const params = { jar, redirects: 0, timeout: profile.timeout, tags: { phase: 'cleanup', name: 'cleanup' } };
  try {
    Object.keys(session.cookies).forEach(name => jar.set(baseUrl, name, session.cookies[name][0], { path: '/' }));
    const csrf = data(prepareGet('/api/v1/csrf', params));
    if (!csrf || csrf.headerName !== 'X-XSRF-TOKEN' || !csrf.token) throw new Error('CSRF_INVALID');
    params.headers = { 'X-XSRF-TOKEN': csrf.token };
    sleep(0.5);
    cleanupErrors.add(data(http.post(baseUrl + '/api/v1/auth/logout', null, params)).ok !== true);
  } catch (_) { cleanupErrors.add(true); }
}

export function setup() {
  const sessions = [];
  try {
    // Argon2 로그인을 VU의 반복 조회에 섞지 않고 10명을 순서대로 인증한다.
    fixture.accounts.slice(0, profile.accountLimit).forEach(account => {
      const jar = new http.CookieJar();
      const params = { jar, redirects: 0, timeout: profile.timeout, tags: { phase: 'prepare', name: 'prepare' } };
      const csrf = data(prepareGet('/api/v1/csrf', params));
      if (!csrf || csrf.headerName !== 'X-XSRF-TOKEN' || !csrf.token) throw new Error('CSRF_INVALID');
      params.headers = { 'Content-Type': 'application/json', 'X-XSRF-TOKEN': csrf.token };
      sleep(0.5);
      const loggedIn = data(http.post(baseUrl + '/api/v1/auth/login', JSON.stringify({
        loginId: account.loginId, password: account.password }), params));
      const cookies = jar.cookiesForURL(baseUrl + '/api/v1/me');
      // 로그인 직후부터 정리 대상에 넣는다. JWT·비밀번호는 결과 파일에 출력하지 않는다.
      const session = { userId: account.userId, cookies };
      sessions.push(session);
      if (loggedIn.userId !== account.userId || !cookies.accessToken || !cookies.refreshToken) {
        throw new Error('LOGIN_IDENTITY_OR_COOKIE_INVALID');
      }
      if (data(prepareGet('/api/v1/me', params)).userId !== account.userId) throw new Error('ME_INVALID');
      const listed = prepareGet('/api/v1/jars?page=0&size=20', params);
      if (!validResponse(listed.status, listed.body, { endpoint: 'jar_list' }, fixture, account.userId)) {
        throw new Error('MEMBERSHIP_INVALID');
      }
    });
    return sessions;
  } catch (_) {
    sessions.forEach(closeSession);
    throw new Error('EC2_SETUP_FAILED_CHECK_PRIVATE_FIXTURE_AND_SESSIONS');
  }
}

export default function (sessions) {
  // 준비 진단의 반복 함수는 HTTP를 호출하지 않는다. setup·teardown만 실제 요청을 보낸다.
  if (profile.preparationOnly) return;
  const session = sessions[__VU - 1];
  if (!session) throw new Error('DEDICATED_VU_SESSION_MISSING');
  const op = operation(__ITER, __VU, fixture);
  const response = http.get(baseUrl + op.path, {
    cookies: { accessToken: session.cookies.accessToken[0] }, redirects: 0, timeout: profile.timeout,
    tags: { phase: 'read', endpoint: op.endpoint, name: op.endpoint },
  });
  const correct = validResponse(response.status, response.body, op, fixture, session.userId);
  check(response, { 'status and fixture data match': () => correct }, { endpoint: op.endpoint });
  readErrors.add(!correct);
  readRequests.add(1, { endpoint: op.endpoint });
  // 응답 대기 후 1초 쉬는 폐쇄형 부하다. 10 VU는 고정 10 req/s나 실사용자 10명의 증명이 아니다.
  sleep(1);
}

export function teardown(sessions) {
  (sessions || []).forEach(closeSession);
  // 강제 종료에서는 정리가 실행되지 않을 수 있다. 전용 계정에 한정해 잔존 세션을 확인한다.
}
