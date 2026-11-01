import test from 'node:test';
import assert from 'node:assert/strict';
import {validateConcurrentFixture, validateConcurrentTarget, validateConcurrentSessions,
  concurrentSessionIndex, concurrentOptions, createConcurrentReader} from './read-concurrent-1000-policy.mjs';

function fixture() {
  return {schema: 2, scope: 'isolated-local-1000', runId: 'lt1234abcd',
    dataset: {storedUsers: 10000, activeAccounts: 1000, backgroundAccounts: 9000, jars: 9300, notes: 21000, forbiddenJarId: 9300},
    groups: Array.from({length: 100}, (_,g) => ({schema: 1, scope: 'isolated-local', runId: 'lt1234abcd', pageSize: 20, notesPerJar: 40,
      accounts: Array.from({length: 10}, (_,a) => ({userId: g*10+a+1, loginId: 'lt1234abcd'+(g*10+a), password: 'fake-test-only'})),
      jars: Array.from({length: 3}, (_,j) => ({jarId: g*3+j+1, ownerId: g*10+j+1, name: 'lt1234abcd-jar-'+(g*10+j),
        noteIds: Array.from({length: 40}, (_,n) => (g*3+j)*40+n+1)}))}))};
}

test('운영·호스트 주소를 거절하고 정확한 격리 네트워크와 1000개의 독립 계정만 허용한다', () => {
  assert.doesNotThrow(() => validateConcurrentFixture(fixture(),'http://app:8080',true));
  for (const url of ['https://api.esjh.shop','http://127.0.0.1:8080','http://app:8080/path','http://evil@ app:8080'])
    assert.throws(() => validateConcurrentTarget(url,true));
  assert.throws(() => validateConcurrentTarget('http://app:8080',false));
  for (const change of [f=>f.groups.pop(), f=>f.dataset.activeAccounts--, f=>f.dataset.notes++,
    f=>f.groups[1]=f.groups[0], f=>f.groups[1].jars[0].jarId=f.groups[0].jars[0].jarId,
    f=>f.groups[1].jars[0].noteIds[0]=f.groups[0].jars[0].noteIds[0], f=>f.dataset.forbiddenJarId=1]) {
    const value=fixture();change(value);
    assert.throws(() => validateConcurrentFixture(value,'http://app:8080',true));
  }
});

test('1000 VU마다 서로 다른 계정 하나를 배정하고 승인 범위 밖 단계는 거절한다', () => {
  assert.equal(new Set(Array.from({length:1000},(_,i)=>concurrentSessionIndex(i+1))).size,1000);
  for (const vu of [0,1001,-1,1.5,NaN]) assert.throws(()=>concurrentSessionIndex(vu));
  for (const vus of [100,300,500,1000]) assert.equal(concurrentOptions(String(vus)).vus,vus);
  assert.equal(concurrentOptions('500').duration,'30s');
  for (const vus of ['',10,2000,'abc']) assert.throws(()=>concurrentOptions(vus));
});

test('다른 사용자 세션·누락·중복·순서 변경을 부하 시작 전에 거절한다', () => {
  const family=fixture();
  const sessions=family.groups.flatMap((group,groupIndex)=>group.accounts.map(a=>({groupIndex,userId:a.userId,token:'fake-only-'+a.userId})));
  assert.doesNotThrow(()=>validateConcurrentSessions(sessions,family.groups));
  for (const change of [s=>s.pop(),s=>s[10]=s[0],s=>s[1].token='',s=>s[0]=null,
    s=>s[1].token=s[0].token,
    s=>[s[0],s[1]]=[s[1],s[0]]]) {
    const values=structuredClone(sessions);change(values);
    assert.throws(()=>validateConcurrentSessions(values,family.groups));
  }
});

test('VU별 세션과 묶음은 최초 한 번만 꺼내고 1000명 사이에 인증정보를 공유하지 않는다', () => {
  const family = fixture();
  const sessions = family.groups.flatMap((group, groupIndex) =>
    group.accounts.map(a => ({groupIndex, userId: a.userId, token: 'fake-only-' + a.userId})));
  let sessionReads = 0, groupReads = 0;
  const trackedSessions = new Proxy(sessions, {get(target, key) {
    if (/^\d+$/.test(String(key))) sessionReads++;
    return target[key];
  }});
  const trackedGroups = new Proxy(family.groups, {get(target, key) {
    if (/^\d+$/.test(String(key))) groupReads++;
    return target[key];
  }});
  const tokens = new Set();
  for (let vu = 1; vu <= 1000; vu++) {
    const read = createConcurrentReader(trackedSessions, trackedGroups);
    const first = read(vu);
    for (let iteration = 0; iteration < 30; iteration++) assert.equal(read(vu), first);
    assert.equal(first.session.userId, vu);
    tokens.add(first.session.token);
    assert.throws(() => read(vu === 1000 ? 1 : vu + 1), /VU_CONTEXT_MUST_NOT_BE_SHARED/);
    assert.throws(() => read(0), /INVALID_CONCURRENT_VU/);
  }
  assert.equal(tokens.size, 1000);
  assert.equal(sessionReads, 1000);
  assert.equal(groupReads, 1000);
});
