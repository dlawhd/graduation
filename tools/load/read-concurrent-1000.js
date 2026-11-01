// 준비된 1,000개의 서로 다른 세션으로 로컬 API만 조회한다. SharedArray로 VU마다 전체 데이터 복제를 피한다.
import http from 'k6/http';
import {check, sleep} from 'k6';
import {SharedArray} from 'k6/data';
import {Counter, Rate} from 'k6/metrics';
import {ENDPOINTS, operation} from './read-contract.mjs';
import {validateConcurrentTarget, validateConcurrentFixture, validateConcurrentSessions, createConcurrentReader, concurrentOptions} from './read-concurrent-1000-policy.mjs';

const baseUrl = __ENV.BASE_URL || '';
validateConcurrentTarget(baseUrl, __ENV.ISOLATED_K6 === '1');
const stage = concurrentOptions(__ENV.CONCURRENT_VUS);
const groups = new SharedArray('concurrent-groups', () => {
  const family = JSON.parse(open(__ENV.FIXTURE_PATH));
  validateConcurrentFixture(family, baseUrl, true);
  return family.groups;
});
const sessions = new SharedArray('concurrent-sessions', () => {
  const values = JSON.parse(open(__ENV.SESSIONS_PATH));
  validateConcurrentSessions(values, groups);
  return values;
});
// VU별 JS 실행 공간에 보관한다. 전체 1,000개 세션이나 100개 묶음을 일반 배열로 복제하지 않는다.
const contextForVu = createConcurrentReader(sessions, groups);
const readErrors = new Rate('read_errors'), readRequests = new Counter('read_requests');
const activated = new Counter('activated_users');
const thresholds = {read_errors: [{threshold: 'rate<0.01', abortOnFail: true, delayAbortEval: '10s'}],
  activated_users: ['count==' + stage.vus]};
ENDPOINTS.forEach(endpoint => {
  thresholds['http_req_duration{endpoint:' + endpoint + '}'] = [{threshold: 'p(95)<=500', abortOnFail: true, delayAbortEval: '10s'}];
  thresholds['read_requests{endpoint:' + endpoint + '}'] = ['count>0'];
});
export const options = {scenarios: {read: {executor: 'constant-vus', vus: stage.vus, duration: stage.duration, gracefulStop: '3s'}},
  thresholds, maxRedirects: 0, systemTags: ['status','method','name','scenario','expected_response']};

export default function () {
  const context = contextForVu(__VU);
  const session = context.session, group = context.group;
  // 초반 요청을 1초 범위에 분산해 1,000명이 같은 밀리초에 클릭하는 별도 폭주 시험과 구분한다.
  if (__ITER === 0) { activated.add(1); sleep((__VU % 100) / 100); }
  const op = operation(__ITER, __VU, group);
  const tags = {endpoint: op.endpoint, name: op.endpoint};
  const response = http.get(baseUrl + op.path, {cookies: {accessToken: session.token}, redirects: 0, timeout: '3s', tags});
  const ok = context.validateResponse(response.status, response.body, op);
  check(response, {'status and fixture data match': () => ok}, tags);
  readErrors.add(!ok, tags); readRequests.add(1, tags);
  // 현실적인 조회 간격을 둔 폐쇄형 시험이다. 동시 사용자 수는 초당 요청 수를 뜻하지 않는다.
  sleep(1);
}
