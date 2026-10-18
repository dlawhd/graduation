# EC2 조회 10 VU 실행 준비

## 현재 상태

운영 데이터 준비와 순차 기능 재확인은 끝났지만 **운영 10 VU는 실행하지 않았다**.
이 문서는 다음 점검 시간에 사용할 시나리오와 감시기 연결 방법이다.
앞선 첫 HTTPS 시간 초과의 요청 종류와 원인은 확정하지 못했으며, 성공한 재확인으로 삭제하지 않는다.
자세한 이전 결과는 [운영 준비 기록](EC2_READ_TEST_PREPARATION.md)을 따른다.

## 이번 단계에서 추가한 것

| 파일 | 이전 상태 → 변경 |
| --- | --- |
| `tools/load/read-ec2-policy.mjs` | 로컬 주소만 허용하던 도구와 별개로, 정확한 HTTPS 주소·운영 fixture·명시 승인값 검사 |
| `tools/load/read-ec2.js` | 기존 순수 응답 계약 재사용. EC2용 인증·반복 조회·정리와 중단 threshold 구성 |
| `tools/load/read-ec2.test.mjs` | 네트워크 없는 대역으로 계정 분리·호출 범위·오류 처리와 실제 k6 옵션 해석 검사 |

기존 로컬 주소 제한을 완화하지 않았다. 서버 API·DB 스키마·권한·프론트엔드·배포 설정은 바꾸지 않았다.
의존성 추가 없이 기존 k6와 Node 테스트를 사용한다.

## 고정 시나리오

| 항목 | 설정 |
| --- | --- |
| 대상 | `https://api.esjh.shop`만 허용, TLS 검증 유지·리다이렉트 금지 |
| 데이터 | 이미 생성한 전용 계정 10개·저금통 3개·텍스트 쪽지 120개 |
| 인증 준비 | 10명을 순차 로그인·내 정보·참여 목록 확인. 요청 사이 0.5초 휴식, 최대 120초 |
| 부하 | 10 VU 고정, 각 VU가 서로 다른 계정 사용, 조회 구간 60초 |
| 요청 간격 | 응답을 받은 뒤 1초 휴식. 고정 RPS 시험이 아님 |
| 비율 | 저금통 목록 30%·상세 30%·쪽지 목록 40%, 각 VU의 10회 주기 기준 |
| 제한 | 요청별 3초, 종료 유예 3초. 임의 자동 재시도 없음 |
| 정상 종료 정리 | 전용 계정 로그아웃, 최대 90초. 정리 오류도 실패로 기록 |
| 제외 | 이미지·첨부·AI·심사·메일·회원가입·초대·삭제·WebSocket |

실행 총시간에는 인증 준비와 정리도 더해진다. 로그인은 Refresh Token을 생성하므로 전체 실행이 읽기 전용은 아니다.
시험 데이터가 작고 이미지가 없으므로 이 60초 시험만으로 실제 사용자 300명·500명의 사용을 대표하지 않는다.

## 판정과 중단

- 조회 구간만 API별 `http_req_duration` p95 ≤ 500ms, `read_errors` < 1%.
- HTTP 200이라도 ID·역할·쪽지 순서·페이지 정보가 틀리면 오류로 센다.
- k6 threshold의 초기 평가 유예는 10초다. 실패가 확정되면 종료하며, 종료 시에도 모든 threshold를 확인한다.
- 준비·로그아웃 요청은 조회 p95와 요청 수에서 제외한다. 조회 처리량은 `read_requests`로 계산한다.
- p95는 PC에서 관측한 HTTP 송신·서버 대기·수신 시간이다. 서버 메서드 실행 시간만을 뜻하지 않는다.
- 기존 자원 감시기: 정상 표본 2개 확인 후 실행, CPU > 70%·Heap > 75%·풀 > 80%가 30초 지속되면 중단.
- 풀 ≥ 70% 경고, 가용 메모리 < 64MiB·Heap ≥ 90%·수집 장애·컨테이너 변경·재시작/OOM 변화는 즉시 중단.
- 감시기는 자신이 시작한 k6만 종료한다. 운영 컨테이너나 무관한 프로세스를 종료하지 않는다.

강제 종료에서는 로그아웃과 k6 최종 summary가 생략될 수 있다. 이런 결과를 합격으로 바꾸지 않는다.
종료 후 기존 `fixture-status`로 시험 세션을 확인하고, 남으면 승인한 전용 계정 범위에서만 폐기한다.
Access JWT 즉시 무효화와 Refresh Token 폐기는 다르다. JWT·쿠키·비밀번호는 출력하거나 Git에 추가하지 않는다.

## 실제 실행 전 필수 확인

1. 실제 두 사용자가 이용하지 않는 시간을 확인하고 10 VU 시작을 승인받는다.
2. 현재 배포 이미지·기동 시각·Git 상태·시나리오 파일 해시·k6 버전을 기록한다. 자동 배포 중에는 시작하지 않는다.
3. 최신 백업·checksum·PC 사본을 확인한다. 필요하면 기존 백업 절차로 새로 만든다.
4. 기존 전용 fixture와 데이터 범위를 재확인한다. `provision`을 다시 실행하지 않는다.
5. 부하 없는 자원 관측으로 여유를 확인한다. 과거 Heap 75.4% 단발 관측과 시간 초과 이력을 숨기지 않는다.
6. 아래 실행 명령의 환경변수·출력 경로를 검토한다. 승인 문자열은 소프트웨어 안전 확인값이지 사람의 승인을 대신하지 않는다.

## 승인 후 실행 명령 예시 — 이번 작업에서는 실행하지 않음

프로젝트 루트의 PowerShell에서 실행하며 출력 폴더는 매번 새 이름을 사용한다.
다른 터미널에서 k6를 단독 실행하거나 VU·시간을 CLI로 덮어쓰지 않는다.

```powershell
python -B tools/monitoring/guard-load.py `
  --ssh-target ubuntu@52.78.116.71 `
  --identity C:/Users/whdgu/Downloads/graduation-key.pem `
  --output build/monitoring/ec2-read10-점검시각 `
  --max-seconds 360 -- `
  k6 run --no-usage-report `
  --summary-export build/monitoring/ec2-read10-점검시각/k6-summary.json `
  --out json=build/monitoring/ec2-read10-점검시각/k6-metrics.jsonl `
  --env BASE_URL=https://api.esjh.shop `
  --env FIXTURE_PATH=C:/Users/whdgu/Desktop/graduation/build/load-ec2/prep-20261018/fixture.private.json `
  --env EC2_READ_APPROVAL=10VU_60S_WITH_GUARD `
  tools/load/read-ec2.js
```

출력은 Git에서 제외되는 build 아래에 보관한다. 감시기의 `LOAD_FINISHED`만으로 API 합격을 단정하지 않는다.
종료 후에도 별도 observe-only 실행으로 60초 자원 회복을 관찰한다. 짧은 회복 관측은 장기 메모리 누수 검증이 아니다.
10 VU 결과를 검토하기 전 50 VU 이상으로 자동 승급하지 않는다.

## 로컬 검증

```powershell
node --test tools/load/read-ec2.test.mjs tools/load/read-contract.test.mjs
python -B tools/load/test_ec2_prep.py
python -B tools/monitoring/test_guard.py
python -B tools/load/test_read_abort.py
```

새 시나리오 HTTP 흐름은 Node 대역 검사, 실제 k6 호환성은 HTTP를 실행하지 않는 `inspect`로 검사한다.
기존 로컬 시나리오의 실제 k6 중단 검사와 감시기의 소유 프로세스 종료 검사를 구분한다.
운영용 시나리오·실제 EC2 지표·실제 운영 HTTP를 묶은 통합 실행은 아직 하지 않았다.

2026-10-18 최종 결과: Node 18개·운영 준비 대역 8개·자원 감시기 22개·localhost 실제 k6 중단 4개, 총 52개 통과.
실제 k6 inspect의 시간 표기는 `60s`가 아닌 `1m0s`로 정규화되어 최초 테스트 단언을 수정한 후 재검증했다.
서버 성능이 아닌 도구 검증 결과이며, 운영 요청·커밋·푸시·배포는 이 단계에서 수행하지 않았다.
