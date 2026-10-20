// 운영 조회 시험의 주소·승인·전용 데이터 경계를 로컬 시험과 별도로 검사한다.
import { validateFixtureData } from './read-contract.mjs';

export function validateEc2Read(fixture, baseUrl, approval) {
  // 지속 시험도 임의 시간·VU를 받지 않는다. 실행 전 실제 토큰 만료 여유도 별도로 확인한다.
  const duration = approval === '10VU_60S_WITH_GUARD' ? '60s'
    : approval === '10VU_1800S_WITH_GUARD' ? '1800s' : null;
  if (!duration) throw new Error('EC2_READ_APPROVAL_REQUIRED');
  validateEc2Target(fixture, baseUrl);
  return duration;
}

// 준비 진단도 기존 주소·시험 데이터 검사를 그대로 사용한다. 임의 계정·다른 호스트는 금지한다.
function validateEc2Target(fixture, baseUrl) {
  if (baseUrl !== 'https://api.esjh.shop') throw new Error('EC2_EXACT_HTTPS_TARGET_REQUIRED');
  if (!fixture || fixture.scope !== 'ec2-prepared') throw new Error('EC2_PREPARED_FIXTURE_REQUIRED');
  validateFixtureData(fixture);
}

export function resolveEc2ReadProfile(fixture, baseUrl, approval) {
  // 최초 5초 진단은 최대 4계정의 순차 준비에만 적용했다. 후속 조회 모드는 아래에서 별도 승인한다.
  if (approval === '4ACCOUNTS_5S_PREPARE_ONLY_WITH_GUARD') {
    validateEc2Target(fixture, baseUrl);
    return { preparationOnly: true, accountLimit: 4, timeout: '5s', duration: null };
  }
  // 4개 통과 뒤의 사용자 승인 단계도 별도 이름으로 제한해, 준비와 부하를 혼동하지 않는다.
  if (approval === '10ACCOUNTS_5S_PREPARE_ONLY_WITH_GUARD') {
    validateEc2Target(fixture, baseUrl);
    return { preparationOnly: true, accountLimit: 10, timeout: '5s', duration: null };
  }
  if (approval === '10VU_60S_5S_WITH_GUARD') {
    validateEc2Target(fixture, baseUrl);
    return { preparationOnly: false, accountLimit: 10, timeout: '5s', duration: '60s' };
  }
  // 60초 통과 뒤 승인한 지속 조회도 5초 제한을 유지한다. 임의 기간·VU 확대는 허용하지 않는다.
  if (approval === '10VU_1800S_5S_WITH_GUARD') {
    validateEc2Target(fixture, baseUrl);
    return { preparationOnly: false, accountLimit: 10, timeout: '5s', duration: '1800s' };
  }
  return { preparationOnly: false, accountLimit: 10, timeout: '3s',
    duration: validateEc2Read(fixture, baseUrl, approval) };
}
