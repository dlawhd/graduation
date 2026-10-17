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

## 배포 후 수동 확인 — 아직 자동 배포하지 않음

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

이 스크립트는 단발 조회 도구다. CPU·스왑·OOM 수집, 5초 간격 기록, k6 자동 중단,
지표 수집 중단 시 fail-closed 처리까지 완료한 것은 아니다.
해당 연결과 검증 전에는 부하를 시작하지 않는다.

## 로컬 검증

    .\gradlew.bat test --tests '*ResourceUsageEndpointTest' --tests '*ManagementSecurityConfigTest' bootJar
    .\tools\isolated\run-e2e.ps1

E2E는 실제 별도 관리 포트의 수치 조회, 서비스 포트 차단, 로그인 후에도 차단,
민감 경로·쓰기 차단과 기존 인증·채팅 흐름을 함께 검사한다.
컨테이너의 비-loopback 주소로 관리 포트에 연결할 수 없는지도 실제 소켓으로 검사한다.
성공한 시험의 resources.json에는 로컬 시험 JVM의 수치가 남으며 EC2 측정값은 아니다.
로컬 성공이 EC2 배포·접근 보호·지표 수집 성공을 의미하지는 않는다.
