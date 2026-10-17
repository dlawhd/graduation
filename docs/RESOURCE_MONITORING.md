# Heap·Hikari 최소 계측

## 목적과 적용 범위

성능 개선 전 기준값을 측정하기 위해 JVM Heap과 실제 Hikari 설정·사용량을 읽는다.
조회는 MemoryMXBean·HikariPoolMXBean을 사용하며 DB 쿼리나 새 연결을 만들지 않는다.
서비스 로직, Heap 크기, 풀 크기, AI 처리량은 변경하지 않는다.
Actuator 의존성과 내부 관리 서버를 추가하므로 메모리·시작 시간의 오버헤드는 있다.
계측 버전을 배포하면 기존 이미지와 구분해 SHA·이미지 digest·설정을 기록해야 한다.

## 접근 보호

- 관리 서버: 컨테이너 내부 127.0.0.1:9091.
- 읽기 전용 /actuator/resources와 상세 정보를 숨긴 /actuator/health만 노출한다.
- 일반 API 포트에서는 로그인 여부와 관계없이 관리 경로를 거절한다.
- 관리 경로도 내부 포트·local/remote loopback·허용 GET 경로를 모두 검사한다.
- 환경변수·설정·heapdump·전체 metrics·JMX 노출을 열지 않는다.
- Prometheus·Grafana 서버나 원격 exporter는 추가하지 않는다.
- Docker 포트 매핑·보안 그룹·Nginx 프록시에 9091을 추가하지 않는다.

이 주소는 EC2 호스트가 아니라 컨테이너의 loopback이다.
SSH로 EC2에 접속한 후 호스트의 nsenter·curl로 컨테이너 네트워크 안에서 조회한다.
Docker 및 해당 네트워크 namespace 접근 권한을 가진 운영자는 이 API를 읽을 수 있다.

## 배포 후 수동 확인

로컬 검증 후 별도 배포 승인이 필요하다. 배포 전 DB 백업·복원 확인과 이미지 기록을 유지한다.
EC2 호스트에 docker, nsenter, curl, python3가 있는지 먼저 확인한다.

    # 호스트에서 일반 API 포트의 관리 요청 차단 확인 (예상 403)
    curl --noproxy '*' --max-time 3 -o /dev/null -s -w '%{http_code}\n' http://127.0.0.1:8080/actuator/resources

    # 위 도구가 준비된 호스트에서 한 번 조회
    bash tools/monitoring/read-resources.sh

스크립트는 EC2에 별도로 전달해야 한다. 로컬 저장소에 있다는 이유로 서버에 존재하지는 않는다.
운영 비밀번호·토큰을 복사할 필요가 없다.
명령은 지표만 읽으며 파일 저장·포트 공개·재시작을 하지 않는다.
sudo 권한 부족, API 실패, 잘못된 JSON, 미측정 값은 실패 종료로 반환한다.

## 응답 해석

- heap.usedBytes, heap.maxBytes: 실제 JVM Heap 사용량·최대량(byte).
- heap.usedPercent: 사용량 / 최대량 × 100.
- pools[].maxConnections: 실제 Hikari 최대 풀 크기.
- activeConnections, idleConnections, totalConnections, pendingRequests: 사용 중·유휴·전체·연결 대기 요청 수.
- pools[].usedPercent: 사용 중 연결 / 최대 연결 × 100.
- measurable=false 또는 null: 미초기화·미지원·최대 Heap 미확정 등. 정상/0%로 판정하지 않는다.
- 카운터는 원자적 스냅샷이 아니므로 순간적으로 active+idle과 total이 다를 수 있다.

`read-resources.sh`는 단발 조회 도구다. 주기적 수집과 PC의 부하 중단은 아래 별도 도구가 담당한다.
운영 지표 수집과 중단 경로의 검증 전에는 부하를 시작하지 않는다.

## 5초 수집·부하 중단 도구

추가 의존성 없이 Python 3.8 이상과 기존 SSH를 사용한다.
서버에는 기존 docker·nsenter·curl·python3 및 비대화형 sudo 권한이 필요하다.

| 파일 | 역할 |
| --- | --- |
| `tools/monitoring/collect-resources.py` | EC2의 `/proc`와 두 컨테이너 상태, 내부 Heap·풀 지표를 5초마다 읽어 JSONL 전송 |
| `tools/monitoring/guard-load.py` | PC에서 SSH 수집 감시, 정상 표본 2개 후 자신이 실행한 k6만 시작·중단 |
| `tools/monitoring/test_guard.py` | 모의 표본·통신 끊김·실제 로컬 프로세스로 안전장치 검증 |
| `tools/monitoring/idle-load.js` | 외부 요청 없이 대기만 하는 실제 k6 중단 검증용 스크립트 |

수집기 소스는 SSH 표준 입력으로만 전달한다. 서버 파일 설치·설정 변경·서비스 재시작·포트 공개는 없다.
기존 host key 검증을 유지하고 비밀번호 입력을 기다리지 않는다.
컨테이너 ID·이미지·시작 시각·재시작 횟수를 첫 정상 표본과 비교해 재배포도 감지한다.
컨테이너가 아직 실행 중이라도 OOMKilled=true가 확인되면 중단한다.
호스트 `/proc/vmstat`의 oom_kill 누적 횟수 변화도 감시해 다른 프로세스의 OOM을 놓치지 않는다.

| 감시 항목 | 동작 |
| --- | --- |
| EC2 CPU >70%, Heap >75%, 풀 활성/최대 >80% | 항목별 30초 연속 초과 시 부하 중단. 회복 시 해당 타이머 초기화 |
| 풀 사용률 ≥70% | 경고. 연결 대기 요청 수도 기록 |
| Heap ≥90% 또는 호스트 가용 메모리 <64MiB | 추가 보수적 안전선: 즉시 중단 |
| 수집 오류·잘못된 JSON·미측정·컨테이너 종료/OOM·교체·재시작 | 다음 관측 시 중단 |
| 첫 표본 없음 | 시작 후 20초 이내 수신하지 못하면 부하 시작 금지 |
| 이후 표본 없음 | 마지막 수신 후 15초 이상이면 중단 |
| 전체 실행 시간 | 기본 최대 600초. 부하가 남아 있으면 중단 |

30초·15초와 추가 메모리 안전선은 이번 도구의 운영 보호 기본값이며, 이전 합격 기준의 측정 결과가 아니다.
5초 표본은 그 사이의 순간 장애를 모두 포착하지 못한다. 프로세스 교체는 다음 표본에서 감지한다.
Swap은 사용량과 초당 swap-in/out을 기록하지만, 점유 자체만으로 실패 판정하지 않는다.
CPU는 호스트 전체 평균으로 guest 중복 시간을 제외하며 iowait·steal을 별도 기록한다.
단일 코어 포화·CPU 크레딧·DB 잠금 대기·WS 이상 종료를 모두 측정하는 도구는 아니다.

### 운영 지표만 60초 관찰 — 부하 없음

다음은 **PC Git Bash**에서 실행한다. EC2 SSH 셸에서 실행하는 명령이 아니다.
개인 키는 SSH만 읽으며 내용을 출력하거나 서버에 복사하지 않는다.
이미 존재하는 출력 폴더는 덮어쓰지 않으므로 재실행 시 폴더 이름을 바꾼다.

```bash
cd /c/Users/whdgu/Desktop/graduation
python -B tools/monitoring/guard-load.py \
  --ssh-target ubuntu@52.78.116.71 \
  --identity C:/Users/whdgu/Downloads/graduation-key.pem \
  --output build/monitoring/observe-20261017-manual \
  --observe-seconds 60
```

`--` 뒤 부하 명령을 생략하면 k6를 시작하지 않는다.
추후 승인된 시나리오의 `k6 run ...` 명령을 `--` 뒤에 지정해야 같은 감시기가 부하를 소유한다.
다른 터미널에서 별도로 실행한 k6는 이 도구가 중단하지 않는다.
원격 docker stop, EC2 종료, 이름 기반 전체 프로세스 종료는 하지 않는다.
Windows에서는 소유 PID의 프로세스 트리를 taskkill로 강제 종료한다. Linux에서는 전용 그룹을 종료한다.

### 결과와 제한

- `samples.jsonl`: 수신 시각과 원본 지표. 각 줄을 즉시 flush한다.
- `summary.json`: 관찰 완료/부하 종료/중단 구분, 원인, 실행 시간, 정책, 수집기 SHA-256.
- `collector-errors.log`: SSH 진단. `load.log`: 실행한 k6 출력.
- `OBSERVED`는 수집 성공이지 부하 합격이 아니다. `LOAD_FINISHED`도 자원 감시 중 정상 종료일 뿐, API 기준 통과는 별도 결과로 판단한다.
- 결과는 무시되는 `build/monitoring/` 아래에 보관한다. 토큰·쿠키·개인정보를 k6 콘솔에 출력하지 않는다.
- p95·오류율은 아직 시나리오의 k6 threshold와 연결하지 않았다. WS 부하는 별도 검증이 필요하다.
- 강제 종료 시 k6의 최종 summary가 유실될 수 있으므로 중단 결과를 성공으로 보고하지 않는다.
- PC 절전·감시 프로세스 강제 종료·OS 정지 시 종료 보장은 없다. 부하 시나리오 자체의 짧은 실행 상한과 현장 감시도 필요하다.
- 계측만으로 급격한 OOM이나 서비스 지연을 완전히 예방할 수 없다. 부하 전 두 사용자의 미사용 시간과 최신 백업을 확인한다.

### 외부 요청 없는 중단 시험

```bash
python -B tools/monitoring/test_guard.py
```

정책 경계값·회복 타이머·수집 실패·무응답·잘못된 JSON·재시작·OOM을 확인한다.
실제 로컬 자식 프로세스와 무관한 대조 프로세스를 띄워 소유한 프로세스만 종료하는지 검사한다.
k6가 설치돼 있으면 `idle-load.js`로 HTTP 요청 없이 실제 k6 종료도 검사한다.
이때 가짜 지표의 주기를 줄여 중단 경로를 검증하며 운영 부하나 실제 AWS 장애를 유발하지 않는다.
Windows의 프로세스 종료 권한이 제한된 실행 환경에서는 권한을 허용한 재검증이 필요하다.

## 2026-10-17 검증 결과

- 로컬 정책·프로세스 시험 22개 통과. 권한 제한 환경의 최초 종료 실패 후, 종료 권한을 허용한 최종 실행으로 확인했다.
- 실제 k6의 무통신 대기 실행을 수집 타임아웃으로 종료했고 무관한 대조 프로세스는 계속 실행됐다.
- 최종 수집기로 운영 EC2를 약 61초 관찰: 11개 표본, 부하 시작 없음, 결과 `OBSERVED`.
- 해당 구간 CPU 약 2.50~5.72%, Heap 약 29.49~30.33%, 가용 메모리 약 180.2~200.1MiB.
- 풀 활성·대기 0, swap-out 0B/s, 호스트 OOM 카운터 0 유지, 재시작·컨테이너 교체 경고 없음.
- 실제 EC2 지표 수신 후 HTTP 없는 k6를 1 VU·2초 실행하는 연결 검증도 정상 종료했다. k6 데이터 송수신 0B이며 서비스 10 VU 시험이 아니다.
- 원본은 `build/monitoring/observe-20261017-final/`, 연결 검증은 `build/monitoring/idle-wiring-20261017/`에 보존한다.

서비스 소스·배포 설정·Heap/풀 크기는 변경하지 않았다. 이번 변경은 PC/서버 운영 도구와 문서뿐이다.
일반 조회 시나리오·시험 데이터·API별 p95/오류율 중단 threshold·점검 시간 확인 후에만 10 VU를 시작한다.

## 로컬 검증

    .\gradlew.bat test --tests '*ResourceUsageEndpointTest' --tests '*ManagementSecurityConfigTest' bootJar
    .\tools\isolated\run-e2e.ps1

E2E는 실제 별도 관리 포트의 수치 조회, 서비스 포트 차단, 로그인 후에도 차단,
민감 경로·쓰기 차단과 기존 인증·채팅 흐름을 함께 검사한다.
컨테이너의 비-loopback 주소로 관리 포트에 연결할 수 없는지도 실제 소켓으로 검사한다.
성공한 시험의 resources.json에는 로컬 시험 JVM의 수치가 남으며 EC2 측정값은 아니다.
로컬 성공이 EC2 배포·접근 보호·지표 수집 성공을 의미하지는 않는다.
