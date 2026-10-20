import test from 'node:test';
import assert from 'node:assert/strict';
import { ENDPOINTS, operation, readThresholds, validResponse, validateFixture } from './read-contract.mjs';

// 서버나 사용자 데이터를 읽지 않는 응답 계약 검사 전용 가짜 데이터다.
export function fixture() {
  return { schema: 1, scope: 'isolated-local', runId: 'ltabcdef12', pageSize: 20, notesPerJar: 40,
    accounts: Array.from({ length: 10 }, (_, i) => ({ userId: i + 1,
      loginId: 'ltabcdef12' + i, password: 'mock-only-password' })),
    jars: Array.from({ length: 3 }, (_, i) => ({ jarId: i + 1, ownerId: i + 1,
      name: 'ltabcdef12-jar-' + i, noteIds: Array.from({ length: 40 }, (_, n) => i * 40 + 40 - n) })) };
}

function jarItem(jar, userId = 1) {
  return { jarId: jar.jarId, name: jar.name, ownerId: jar.ownerId, memberCount: 10,
    maxMembers: 10, isOpen: true, myRole: jar.ownerId === userId ? 'OWNER' : 'MEMBER',
    design: null, openMode: 'ALL_AT_ONCE' };
}

function response(op, f = fixture()) {
  if (op.endpoint === 'jar_detail') return { data: jarItem(op.jar) };
  if (op.endpoint === 'jar_list') return { data: { page: 0, size: 20, totalElements: 3,
    totalPages: 1, items: f.jars.map(jar => jarItem(jar)) } };
  return { data: { page: op.page, size: 20, totalElements: 40, totalPages: 2,
    items: op.jar.noteIds.slice(op.page * 20, (op.page + 1) * 20).map(noteId => ({ noteId,
      title: f.runId + '-note-1', authorId: 1, previewContent: '가상 본문', isEncrypted: false,
      attachments: [], reactionCounts: [], myReaction: null, commentCount: 0 })) } };
}

test('로컬 fixture만 허용하고 원격·운영·리다이렉트 유도 주소를 거절한다', () => {
  validateFixture(fixture(), 'http://127.0.0.1:18080');
  validateFixture(fixture(), 'http://app:8080', true);
  assert.throws(() => validateFixture(fixture(), 'http://app:8080'), /LOCAL_LOOPBACK_REQUIRED/);
  for (const address of ['https://api.esjh.shop', 'http://52.78.116.71:8080',
    'http://127.0.0.1:80@evil.example', 'http://127.0.0.1:18080/path']) {
    assert.throws(() => validateFixture(fixture(), address), /LOCAL_LOOPBACK_REQUIRED/);
  }
  const f = fixture(); f.scope = 'production';
  assert.throws(() => validateFixture(f, 'http://127.0.0.1:18080'), /LOCAL_FIXTURE_REQUIRED/);
});

test('전용 사용자·저금통·쪽지 중복과 잘못된 개수를 거절한다', () => {
  for (const mutate of [f => f.accounts.pop(), f => { f.accounts[1].userId = 1; },
    f => f.jars.pop(), f => { f.jars[0].noteIds[0] = f.jars[1].noteIds[0]; },
    f => { f.jars[0].ownerId = 999; }]) {
    const f = fixture(); mutate(f);
    assert.throws(() => validateFixture(f, 'http://127.0.0.1:18080'));
  }
});

test('30회당 목록9·상세9·쪽지12이고 두 페이지와 세 저금통을 모두 조회한다', () => {
  const ops = Array.from({ length: 30 }, (_, i) => operation(i, 1, fixture()));
  assert.deepEqual(ENDPOINTS.map(endpoint => ops.filter(op => op.endpoint === endpoint).length), [9, 9, 12]);
  assert.deepEqual([...new Set(ops.filter(op => op.endpoint === 'note_list').map(op => op.page))].sort(), [0, 1]);
  assert.equal(new Set(ops.map(op => op.jar.jarId)).size, 3);
  assert.ok(ops.every(op => /^\/api\/v1\/jars(?:\?|\/)/.test(op.path)));
});

for (const endpoint of ENDPOINTS) {
  const op = { endpoint, jar: fixture().jars[0], page: 1 };
  test(endpoint + ': 올바른 상태·ID·역할·개수·페이지를 허용한다', () => {
    assert.equal(validResponse(200, JSON.stringify(response(op)), op, fixture(), 1), true);
  });
  test(endpoint + ': HTTP 오류·HTML·빈 JSON을 성공으로 세지 않는다', () => {
    for (const status of [0, 301, 401, 403, 404, 500]) {
      assert.equal(validResponse(status, JSON.stringify(response(op)), op, fixture(), 1), false);
    }
    for (const body of ['not-json', '<html>login</html>', '{}', '{"data":null}']) {
      assert.equal(validResponse(200, body, op, fixture(), 1), false);
    }
  });
}

test('다른 저금통·다른 쪽지·중복 쪽지·잘못된 역할을 거절한다', () => {
  const f = fixture();
  for (const endpoint of ENDPOINTS) {
    const op = { endpoint, jar: f.jars[0], page: 0 };
    const wrong = response(op);
    if (endpoint === 'jar_detail') wrong.data.jarId = 999;
    else if (endpoint === 'jar_list') wrong.data.items[0].myRole = 'MEMBER';
    else wrong.data.items[0].noteId = wrong.data.items[1].noteId;
    assert.equal(validResponse(200, JSON.stringify(wrong), op, f, 1), false);
  }
});

test('페이지 누락과 예상하지 않은 첨부파일을 거절한다', () => {
  const op = { endpoint: 'note_list', jar: fixture().jars[0], page: 1 };
  for (const mutate of [v => v.items.pop(), v => { v.page = 0; }, v => { v.totalElements = 0; },
    v => { v.items[0].attachments = [{ url: 'https://external.example/image' }]; }]) {
    const wrong = response(op); mutate(wrong.data);
    assert.equal(validResponse(200, JSON.stringify(wrong), op, fixture(), 1), false);
  }
});

test('깨진 배열 요소를 예외로 누락하지 않고 오류 응답으로 판정한다', () => {
  for (const endpoint of ['jar_list', 'note_list']) {
    const op = { endpoint, jar: fixture().jars[0], page: 0 };
    for (const item of [null, 'not-an-object', [], 1]) {
      const wrong = response(op); wrong.data.items[0] = item;
      assert.equal(validResponse(200, JSON.stringify(wrong), op, fixture(), 1), false);
    }
  }
});

test('API별 p95·전체 오류율 자동 중단과 최소 관측 수를 설정한다', () => {
  const thresholds = readThresholds();
  assert.deepEqual(thresholds.read_errors, [{ threshold: 'rate<0.01', abortOnFail: true, delayAbortEval: '10s' }]);
  for (const endpoint of ENDPOINTS) {
    assert.deepEqual(thresholds['http_req_duration{phase:read,endpoint:' + endpoint + '}'],
      [{ threshold: 'p(95)<=500', abortOnFail: true, delayAbortEval: '10s' }]);
    assert.deepEqual(thresholds['read_requests{endpoint:' + endpoint + '}'], ['count>0']);
  }
});

test('임시 2000ms는 명시적으로 선택하고 기존 500ms·오류율·관측 수 기준을 보존한다', () => {
  const old = readThresholds();
  for (const target of [2000, '2000', 5000, '5000']) {
    const selected = readThresholds('10s', target);
    assert.deepEqual(selected.read_errors, old.read_errors);
    for (const endpoint of ENDPOINTS) {
      assert.deepEqual(selected['http_req_duration{phase:read,endpoint:' + endpoint + '}'],
        [{ threshold: 'p(95)<=' + target, abortOnFail: true, delayAbortEval: '10s' }]);
      assert.deepEqual(selected['read_requests{endpoint:' + endpoint + '}'], ['count>0']);
    }
  }
  for (const invalid of ['', null, true, {}, 0, -1, NaN, Infinity, 1000, 10000, '2000ms', ' 2000']) {
    assert.throws(() => readThresholds('10s', invalid), /READ_P95_TARGET_MUST_BE_500_OR_2000_OR_5000/);
  }
});
