// 로컬 사전 검증 전용이다. EC2 성능 기준값으로 사용하지 않고 이미지·메일 경로는 호출하지 않는다.
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Counter } from 'k6/metrics';
import { operation, readThresholds, validResponse, validateFixture } from './read-contract.mjs';

const baseUrl = __ENV.BASE_URL || '';
if (!__ENV.FIXTURE_PATH) throw new Error('LOCAL_FIXTURE_PATH_REQUIRED');
const fixture = JSON.parse(open(__ENV.FIXTURE_PATH));
validateFixture(fixture, baseUrl, __ENV.ISOLATED_K6 === '1');
const readErrors = new Rate('read_errors');
const readRequests = new Counter('read_requests');
// 중단 경로 시험만 더 오래 반복한다. 여전히 loopback 1 VU로 제한한다.
const iterations = __ENV.LOCAL_ABORT_PROBE === '1' ? 400 : 30;

export const options = {
  // 1 VU·30회 조회로 경로와 판정을 검사한다. 서비스 10 VU 부하 시험이 아니다.
  scenarios: { local_contract: { executor: 'shared-iterations', vus: 1, iterations,
    maxDuration: '45s', gracefulStop: '0s' } },
  setupTimeout: '60s',
  maxRedirects: 0,
  thresholds: readThresholds(),
};

function parseData(response) {
  if (response.status !== 200) throw new Error('LOCAL_SETUP_HTTP_FAILED');
  try { return JSON.parse(response.body).data; } catch (_) { throw new Error('LOCAL_SETUP_JSON_FAILED'); }
}

export function setup() {
  // 비용이 큰 Argon2 로그인을 조회 루프에 섞지 않고 10명을 미리 순차 인증한다.
  return fixture.accounts.map(account => {
    const jar = new http.CookieJar();
    const params = { jar, redirects: 0, timeout: '3s', tags: { phase: 'prepare', name: 'prepare' } };
    const csrf = parseData(http.get(baseUrl + '/api/v1/csrf', params));
    if (!csrf || csrf.headerName !== 'X-XSRF-TOKEN' || !csrf.token) throw new Error('LOCAL_CSRF_FAILED');
    params.headers = { 'Content-Type': 'application/json', 'X-XSRF-TOKEN': csrf.token };
    const response = http.post(baseUrl + '/api/v1/auth/login', JSON.stringify({
      loginId: account.loginId, password: account.password }), params);
    if (parseData(response).userId !== account.userId) throw new Error('LOCAL_LOGIN_IDENTITY_FAILED');
    const cookies = jar.cookiesForURL(baseUrl + '/api/v1/me');
    const token = cookies.accessToken && cookies.accessToken[0];
    if (!token) throw new Error('LOCAL_ACCESS_COOKIE_MISSING');
    if (Number(parseData(http.get(baseUrl + '/api/v1/me', params)).userId) !== account.userId) {
      throw new Error('LOCAL_ME_IDENTITY_FAILED');
    }
    const list = { endpoint: 'jar_list' };
    const listed = http.get(baseUrl + '/api/v1/jars?page=0&size=20', params);
    if (!validResponse(listed.status, listed.body, list, fixture, account.userId)) {
      throw new Error('LOCAL_ACCOUNT_MEMBERSHIP_FAILED');
    }
    // JWT는 메모리의 setup 데이터로만 전달하고 로그·결과 파일에는 출력하지 않는다.
    return { userId: account.userId, token };
  });
}

export default function (sessions) {
  const session = sessions[__VU - 1];
  if (!session) throw new Error('DEDICATED_VU_SESSION_MISSING');
  const op = operation(__ITER, __VU, fixture);
  const params = { cookies: { accessToken: session.token }, redirects: 0, timeout: '3s',
    tags: { phase: 'read', endpoint: op.endpoint, name: op.endpoint } };
  const response = http.get(baseUrl + op.path, params);
  const correct = validResponse(response.status, response.body, op, fixture, session.userId);
  check(response, { 'status and fixture data match': () => correct }, { endpoint: op.endpoint });
  readErrors.add(!correct);
  readRequests.add(1, { endpoint: op.endpoint });
  // 기능 검증의 대기만 짧게 한다. 실제 EC2 시나리오의 요청 간격과 구분한다.
  sleep(0.05);
}
