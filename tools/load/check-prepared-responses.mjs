// 운영 준비 중 순차 조회한 응답을 메모리에서만 검사하고 개수만 출력한다. 부하 도구가 아니다.
import { readFileSync } from 'node:fs';
import { validateFixtureData, validResponse } from './read-contract.mjs';

try {
  const input = JSON.parse(readFileSync(0, 'utf8'));
  const fixture = input.fixture;
  if (fixture.scope !== 'ec2-prepared' || input.api !== 'https://api.esjh.shop') throw new Error();
  validateFixtureData(fixture);
  if (input.samples.length !== 19) throw new Error();
  const totals = { jar_list: 0, jar_detail: 0, note_list: 0 };
  for (const sample of input.samples) {
    if (!fixture.accounts.some(a => a.userId === sample.userId)) throw new Error();
    const operation = { endpoint: sample.endpoint, jar: fixture.jars[sample.jarIndex], page: sample.page };
    if (!validResponse(sample.status, sample.body, operation, fixture, sample.userId)) throw new Error();
    totals[sample.endpoint]++;
  }
  if (totals.jar_list !== 10 || totals.jar_detail !== 3 || totals.note_list !== 6) throw new Error();
  console.log(JSON.stringify({ scope: 'PREPARATION_ONLY_NOT_BASELINE', validatedReadResponses: 19, endpoints: totals }));
} catch (_) {
  console.error('PREPARED_RESPONSE_VALIDATION_FAILED: response and credentials not printed');
  process.exitCode = 1;
}
