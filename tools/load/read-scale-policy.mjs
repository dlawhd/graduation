// 상위 VU에서도 계정을 공유하지 않고 10명 묶음별 기존 응답 계약을 유지한다.
import { validateFixtureData } from './read-contract.mjs';

export function validateScale(family, baseUrl, stage, approval) {
  if (!['50', '100', '200', '300'].includes(stage)) throw new Error('INVALID_SCALE_STAGE');
  resolveScaleTimeout(stage, approval);
  if (baseUrl !== 'https://api.esjh.shop') throw new Error('EXACT_HTTPS_TARGET_REQUIRED');
  if (!family || family.schema !== 2 || family.scope !== 'ec2-grouped-read'
    || !Array.isArray(family.groups) || family.groups.length !== 30) throw new Error('THIRTY_GROUPS_REQUIRED');
  const users = new Set(), logins = new Set(), jars = new Set(), notes = new Set(), prefixes = new Set();
  family.groups.forEach(group => {
    if (group.scope !== 'ec2-prepared' || prefixes.has(group.runId)) throw new Error('INVALID_GROUP_SCOPE');
    validateFixtureData(group);
    prefixes.add(group.runId);
    group.accounts.forEach(account => {
      if (users.has(account.userId) || logins.has(account.loginId)) throw new Error('SHARED_ACCOUNT_FORBIDDEN');
      users.add(account.userId); logins.add(account.loginId);
    });
    group.jars.forEach(jar => {
      if (jars.has(jar.jarId)) throw new Error('SHARED_JAR_FORBIDDEN');
      jars.add(jar.jarId);
      jar.noteIds.forEach(id => {
        if (notes.has(id)) throw new Error('SHARED_NOTE_FORBIDDEN');
        notes.add(id);
      });
    });
  });
  return family.groups.slice(0, Number(stage) / 10);
}

export function resolveScaleTimeout(stage, approval) {
  // 이번에 승인한 5초 상위 부하는 50 VU까지만 허용한다. 기존 3초 모드는 보존한다.
  if (stage === '50' && approval === '50VU_60S_5S_WITH_GUARD') return '5s';
  if (['50', '100', '200', '300'].includes(stage) && approval === stage + 'VU_60S_WITH_GUARD') return '3s';
  throw new Error('SCALE_APPROVAL_REQUIRED');
}
