// 로컬 1,000명 시험의 주소·독립 계정·응답 계약을 검증한다. 운영용 도구와 주소를 공유하지 않는다.
import {validateFixture, createResponseValidator} from './read-contract.mjs';

export const CONCURRENT_STAGES = [100, 300, 500, 1000];

export function validateConcurrentTarget(baseUrl, isolated) {
  if (baseUrl !== 'http://app:8080' || !isolated) throw new Error('ISOLATED_APP_ONLY');
}

/** 기존 10명 계약을 100묶음으로 재사용하고 묶음 사이의 ID 중복도 거절한다. */
export function validateConcurrentFixture(family, baseUrl, isolated) {
  validateConcurrentTarget(baseUrl, isolated);
  if (!family || family.schema !== 2 || family.scope !== 'isolated-local-1000'
      || !Array.isArray(family.groups) || family.groups.length !== 100) throw new Error('ONE_HUNDRED_GROUPS_REQUIRED');
  const d = family.dataset;
  if (!d || d.storedUsers !== 10000 || d.activeAccounts !== 1000 || d.backgroundAccounts !== 9000
      || d.jars !== 9300 || d.notes !== 21000 || !Number.isSafeInteger(d.forbiddenJarId) || d.forbiddenJarId < 1)
    throw new Error('EXACT_CONCURRENT_DATASET_REQUIRED');
  const users = new Set(), logins = new Set(), jars = new Set(), notes = new Set();
  family.groups.forEach(group => {
    validateFixture(group, baseUrl, isolated);
    if (group.runId !== family.runId) throw new Error('ONE_RUN_REQUIRED');
    group.accounts.forEach(account => {
      if (users.has(account.userId) || logins.has(account.loginId)) throw new Error('DEDICATED_ACCOUNT_REQUIRED');
      users.add(account.userId); logins.add(account.loginId);
    });
    group.jars.forEach(jar => {
      if (jars.has(jar.jarId) || jar.jarId === d.forbiddenJarId) throw new Error('DEDICATED_JAR_REQUIRED');
      jars.add(jar.jarId);
      jar.noteIds.forEach(id => { if (notes.has(id)) throw new Error('DEDICATED_NOTE_REQUIRED'); notes.add(id); });
    });
  });
}

/** 별도 k6 프로세스에서 시작하는 VU 1..N에 인증된 계정 하나씩 배정한다. */
export function concurrentSessionIndex(vu) {
  if (!Number.isInteger(vu) || vu < 1 || vu > 1000) throw new Error('INVALID_CONCURRENT_VU');
  return vu - 1;
}

/** k6의 각 VU가 자기 계정·묶음만 한 번 복사한다. 서로 다른 VU의 세션을 공유하지 않는다. */
export function createConcurrentReader(sessions, groups) {
  let assignedVu = null, context = null;
  return function contextForVu(vu) {
    const index = concurrentSessionIndex(vu);
    if (context !== null) {
      if (assignedVu !== vu) throw new Error('VU_CONTEXT_MUST_NOT_BE_SHARED');
      return context;
    }
    const session = sessions[index];
    const group = groups[session.groupIndex];
    assignedVu = vu;
    context = {session, group, validateResponse: createResponseValidator(group, session.userId)};
    return context;
  };
}

export function concurrentOptions(value) {
  const vus = Number(value);
  if (!CONCURRENT_STAGES.includes(vus)) throw new Error('INVALID_CONCURRENT_STAGE');
  return {vus, duration: vus >= 500 ? '30s' : '20s'};
}

/** 세션 파일 순서와 실제 로그인한 사용자 ID를 대조해 다른 계정의 토큰을 잘못 배정하지 않는다. */
export function validateConcurrentSessions(values, groups) {
  if (!Array.isArray(values) || values.length !== 1000) throw new Error('ONE_THOUSAND_SESSIONS_REQUIRED');
  const users = new Set(), tokens = new Set();
  values.forEach((value, index) => {
    const groupIndex = Math.floor(index / 10), accountIndex = index % 10;
    if (!value || value.groupIndex !== groupIndex || value.userId !== groups[groupIndex].accounts[accountIndex].userId
        || users.has(value.userId) || typeof value.token !== 'string' || !value.token || tokens.has(value.token))
      throw new Error('SESSION_IDENTITY_MISMATCH');
    users.add(value.userId); tokens.add(value.token);
  });
}
