// 기존 10계정 응답 계약은 유지하고, 배경 9990계정이 있는 로컬 전용 시험만 추가한다.
import {validateFixture} from './read-contract.mjs';

export function validateDataset(fixture, baseUrl, isolated) {
  validateFixture(fixture, baseUrl, isolated);
  const d = fixture.dataset;
  if (!d || d.storedUsers !== 10000 || d.activeAccounts !== 10 || d.backgroundAccounts !== 9990
      || d.jars !== 9993 || d.notes !== 10110) throw new Error('EXACT_LOCAL_DATASET_REQUIRED');
  if(!Number.isSafeInteger(d.forbiddenJarId)||d.forbiddenJarId<1
      ||fixture.jars.some(j=>j.jarId===d.forbiddenJarId))throw new Error('SEPARATE_FORBIDDEN_JAR_REQUIRED');
}

/** 단계 간 동시 실행은 없으며, 10개 인증 세션을 최대 10 VU에 각각 배정한다. */
export function sessionIndex(vu) {
  if (!Number.isInteger(vu) || vu < 1) throw new Error('INVALID_VU');
  return (vu - 1) % 10;
}

export const DATASET_STAGES = [
  {name:'one',vus:1,duration:'20s',startTime:'0s',exec:'readOne'},
  {name:'five',vus:5,duration:'20s',startTime:'25s',exec:'readFive'},
  {name:'ten',vus:10,duration:'30s',startTime:'50s',exec:'readTen'},
];
