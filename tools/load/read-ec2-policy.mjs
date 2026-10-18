// 운영 조회 시험의 주소·승인·전용 데이터 경계를 로컬 시험과 별도로 검사한다.
import { validateFixtureData } from './read-contract.mjs';

export function validateEc2Read(fixture, baseUrl, approval) {
  if (approval !== '10VU_60S_WITH_GUARD') throw new Error('EC2_READ_APPROVAL_REQUIRED');
  if (baseUrl !== 'https://api.esjh.shop') throw new Error('EC2_EXACT_HTTPS_TARGET_REQUIRED');
  if (!fixture || fixture.scope !== 'ec2-prepared') throw new Error('EC2_PREPARED_FIXTURE_REQUIRED');
  validateFixtureData(fixture);
}
