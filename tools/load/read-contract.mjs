// k6와 Node 검사가 같은 검증 규칙을 사용한다. 인증정보·응답 본문은 출력하지 않는다.
export const ENDPOINTS = ['jar_list', 'jar_detail', 'note_list'];

function requireValue(condition, code) {
  if (!condition) throw new Error(code);
}

function positiveId(value) {
  return Number.isSafeInteger(value) && value > 0;
}

export function validateFixture(fixture, baseUrl, isolatedNetwork = false) {
  // 이번 단계는 로컬 기능 검증 전용이다. EC2·임의 원격 주소는 실행 자체를 거절한다.
  requireValue(/^http:\/\/127\.0\.0\.1:[1-9][0-9]{0,4}$/.test(baseUrl)
    || (isolatedNetwork && baseUrl === 'http://app:8080'), 'LOCAL_LOOPBACK_REQUIRED');
  requireValue(fixture && fixture.schema === 1 && fixture.scope === 'isolated-local', 'LOCAL_FIXTURE_REQUIRED');
  validateFixtureData(fixture);
}

// 주소 허용 규칙과 분리한 순수 데이터 계약. 운영 준비의 단건 기능 확인에서도 재사용한다.
export function validateFixtureData(fixture) {
  requireValue(fixture && fixture.schema === 1, 'INVALID_FIXTURE_SCHEMA');
  requireValue(/^lt[a-f0-9]{8}$/.test(fixture.runId), 'INVALID_RUN_ID');
  requireValue(fixture.pageSize === 20 && fixture.notesPerJar === 40, 'INVALID_DATASET_SIZE');
  requireValue(Array.isArray(fixture.accounts) && fixture.accounts.length === 10, 'TEN_ACCOUNTS_REQUIRED');
  const users = new Set();
  const logins = new Set();
  fixture.accounts.forEach(account => {
    requireValue(positiveId(account.userId) && !users.has(account.userId), 'INVALID_USER_ID');
    requireValue(typeof account.loginId === 'string' && account.loginId.startsWith(fixture.runId)
      && !logins.has(account.loginId), 'INVALID_LOGIN_ID');
    requireValue(typeof account.password === 'string' && account.password.length >= 8, 'INVALID_PASSWORD');
    users.add(account.userId);
    logins.add(account.loginId);
  });
  requireValue(Array.isArray(fixture.jars) && fixture.jars.length === 3, 'THREE_JARS_REQUIRED');
  const jars = new Set();
  const notes = new Set();
  fixture.jars.forEach(jar => {
    requireValue(positiveId(jar.jarId) && !jars.has(jar.jarId), 'INVALID_JAR_ID');
    requireValue(typeof jar.name === 'string' && jar.name.startsWith(fixture.runId + '-jar-')
      && users.has(jar.ownerId), 'INVALID_JAR_OWNER');
    requireValue(Array.isArray(jar.noteIds) && jar.noteIds.length === 40, 'FORTY_NOTES_REQUIRED');
    jar.noteIds.forEach(id => {
      requireValue(positiveId(id) && !notes.has(id), 'INVALID_NOTE_ID');
      notes.add(id);
    });
    jars.add(jar.jarId);
  });
}

export function operation(iteration, vu, fixture) {
  // 10회마다 목록 3·상세 3·쪽지 4회. VU별 위상을 달리해 첫 요청이 한 종류로 몰리지 않게 한다.
  const slot = (iteration + vu - 1) % 10;
  const endpoint = slot < 3 ? ENDPOINTS[0] : slot < 6 ? ENDPOINTS[1] : ENDPOINTS[2];
  const jar = fixture.jars[(iteration + vu - 1) % fixture.jars.length];
  const page = Math.floor(iteration / 10) % 2;
  return { endpoint, jar, page, path: endpoint === 'jar_list' ? '/api/v1/jars?page=0&size=20'
    : endpoint === 'jar_detail' ? '/api/v1/jars/' + jar.jarId
      : '/api/v1/jars/' + jar.jarId + '/notes?page=' + page + '&size=20' };
}

export function validResponse(status, body, operation, fixture, userId) {
  if (status !== 200) return false;
  let value;
  try { value = JSON.parse(body).data; } catch (_) { return false; }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const role = jar => jar.ownerId === userId ? 'OWNER' : 'MEMBER';
  const validJar = (item, jar) => item && item.jarId === jar.jarId && item.name === jar.name
    && item.isOpen === true && item.myRole === role(jar) && item.memberCount === 10
    && item.maxMembers === 10 && item.design === null && item.openMode === 'ALL_AT_ONCE';
  if (operation.endpoint === 'jar_detail') {
    return validJar(value, operation.jar) && value.ownerId === operation.jar.ownerId;
  }
  const expectedCount = operation.endpoint === 'jar_list' ? 3 : 40;
  const page = operation.endpoint === 'jar_list' ? 0 : operation.page;
  if (value.page !== page || value.size !== 20 || value.totalElements !== expectedCount
    || value.totalPages !== Math.ceil(expectedCount / 20) || !Array.isArray(value.items)
    || value.items.length !== Math.min(20, expectedCount)) return false;
  // 요소가 null/문자열이면 예외로 빠져 오류 표본이 누락되지 않게 명시적으로 실패 처리한다.
  if (value.items.some(item => !item || typeof item !== 'object' || Array.isArray(item))) return false;
  if (operation.endpoint === 'jar_list') {
    const ids = value.items.map(item => item.jarId);
    return new Set(ids).size === 3 && value.items.every(item => {
      const jar = fixture.jars.find(candidate => candidate.jarId === item.jarId);
      return jar && validJar(item, jar);
    });
  }
  if (operation.endpoint !== 'note_list') return false;
  const expectedIds = operation.jar.noteIds.slice(page * 20, (page + 1) * 20);
  return value.items.every((item, index) => item.noteId === expectedIds[index]
    && fixture.accounts.some(account => account.userId === item.authorId)
    && typeof item.title === 'string' && item.title.startsWith(fixture.runId + '-note-')
    && typeof item.previewContent === 'string' && item.previewContent.length > 0
    && item.isEncrypted === false && Array.isArray(item.attachments) && item.attachments.length === 0
    && Array.isArray(item.reactionCounts) && item.reactionCounts.length === 0
    && item.myReaction === null && item.commentCount === 0);
}

// 과거 500ms·2000ms 실행을 보존하고, 이번에 승인한 5000ms도 명시적으로만 선택한다.
export function readThresholds(delay = '10s', p95Ms = 500) {
  requireValue((typeof p95Ms === 'number' || typeof p95Ms === 'string')
    && ['500', '2000', '5000'].includes(String(p95Ms)), 'READ_P95_TARGET_MUST_BE_500_OR_2000_OR_5000');
  const thresholds = { read_errors: [{ threshold: 'rate<0.01', abortOnFail: true, delayAbortEval: delay }] };
  ENDPOINTS.forEach(endpoint => {
    thresholds['http_req_duration{phase:read,endpoint:' + endpoint + '}'] = [
      { threshold: 'p(95)<=' + p95Ms, abortOnFail: true, delayAbortEval: delay }];
    // 아무것도 측정하지 않은 시험이 성공하지 않도록 API별 관측 수도 최종 검사한다.
    thresholds['read_requests{endpoint:' + endpoint + '}'] = ['count>0'];
  });
  return thresholds;
}
