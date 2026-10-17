// 중단 장치 검증 전용: HTTP·WebSocket·AWS 요청 없이 대기만 한다.
import { sleep } from 'k6';

export const options = { vus: 1, duration: '30s' };

export default function () {
  sleep(1);
}
