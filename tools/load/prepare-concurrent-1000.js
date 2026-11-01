// 먼저 1,000개 계정의 실제 로그인을 수행한다. 세션은 실행기가 비공개 파일로 옮겨 조회 프로세스에만 전달한다.
import http from 'k6/http';
import {SharedArray} from 'k6/data';
import {Counter, Trend} from 'k6/metrics';
import {validResponse} from './read-contract.mjs';
import {validateConcurrentTarget, validateConcurrentFixture} from './read-concurrent-1000-policy.mjs';

const baseUrl = __ENV.BASE_URL || '';
validateConcurrentTarget(baseUrl, __ENV.ISOLATED_K6 === '1');
const groups = new SharedArray('concurrent-auth-groups', () => {
  const family = JSON.parse(open(__ENV.FIXTURE_PATH));
  validateConcurrentFixture(family, baseUrl, true);
  return family.groups;
});
const forbiddenJar = new SharedArray('concurrent-auth-meta', () => [JSON.parse(open(__ENV.FIXTURE_PATH)).dataset.forbiddenJarId])[0];
const loginRequests = new Counter('login_requests'), prepared = new Counter('prepared_accounts');
const loginDuration = new Trend('login_duration_ms', true), authorizationChecks = new Counter('authorization_checks');
export const options = {vus: 1, iterations: 1, setupTimeout: '8m', maxRedirects: 0,
  systemTags: ['status','method','name','expected_response'],
  thresholds: {login_requests: ['count==1000'], prepared_accounts: ['count==1000'], authorization_checks: ['count==1']}};

/** 비밀번호 해시 검증·CSRF·쿠키 인증을 실제 API로 확인한다. 준비 시간은 조회 시간과 분리한다. */
export function setup() {
  const sessions = [];
  groups.forEach((group, groupIndex) => group.accounts.forEach(account => {
    const jar = new http.CookieJar();
    const params = {jar, redirects: 0, timeout: '5s', tags: {name: 'auth_prepare', phase: 'prepare'}};
    const data = response => {
      if (response.status !== 200) throw new Error('CONCURRENT_AUTH_HTTP_FAILED');
      return JSON.parse(response.body).data;
    };
    const csrf = data(http.get(baseUrl + '/api/v1/csrf', params));
    if (csrf.headerName !== 'X-XSRF-TOKEN' || !csrf.token) throw new Error('INVALID_CSRF');
    params.headers = {'Content-Type': 'application/json', 'X-XSRF-TOKEN': csrf.token};
    const login = http.post(baseUrl + '/api/v1/auth/login', JSON.stringify({loginId: account.loginId, password: account.password}),
      Object.assign({}, params, {tags: {name: 'login', phase: 'prepare'}}));
    loginRequests.add(1); loginDuration.add(login.timings.duration);
    if (data(login).userId !== account.userId) throw new Error('CONCURRENT_LOGIN_IDENTITY_FAILED');
    const access = jar.cookiesForURL(baseUrl + '/api/v1/me').accessToken;
    if (!access || !access[0] || data(http.get(baseUrl + '/api/v1/me', params)).userId !== account.userId)
      throw new Error('CONCURRENT_SESSION_FAILED');
    const listed = http.get(baseUrl + '/api/v1/jars?page=0&size=20', params);
    if (!validResponse(listed.status, listed.body, {endpoint: 'jar_list'}, group, account.userId))
      throw new Error('CONCURRENT_MEMBERSHIP_FAILED');
    if (sessions.length === 0) {
      if (http.get(baseUrl + '/api/v1/jars/' + forbiddenJar, params).status !== 403)
        throw new Error('CONCURRENT_AUTHORIZATION_FAILED');
      authorizationChecks.add(1);
    }
    sessions.push({groupIndex, userId: account.userId, token: access[0]});
    prepared.add(1);
  }));
  return sessions;
}

export default function () { /* 인증 준비만 실행하며 조회 부하는 다음 프로세스에서 시작한다. */ }
