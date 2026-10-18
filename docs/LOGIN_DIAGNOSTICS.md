# 로그인 단계·GC·프로세스 페이지 폴트 계측 준비

## 목적과 이전 상태

50 VU는 조회 구간 이전의 첫 로그인 3초 시간 초과로 준비가 실패했다.
Nginx에서 upstream 연결 0.000초, 응답 헤더 미수신 상태로 3.013초 뒤 499가 기록됐다.
같은 시간대 호스트 스왑·I/O 대기는 있었지만, 비밀번호 검증·DB 저장·GC 중 어느 구간인지 나눌 수 없었다.
이를 구분하는 계측이며 성능 개선이나 메모리 설정 변경이 아니다.

## 변경 파일과 역할

| 파일 | 변경 |
| --- | --- |
| src/main/java/shop/esjh/memoryjar/monitoring/LoginDiagnostics.java | 기본 꺼짐, 요청별 고정 단계 시간·GC 누적 차이, 최근 완료 64건만 보존 |
| src/main/java/shop/esjh/memoryjar/monitoring/LoginDiagnosticsFilter.java | 로그인 POST에만 요청 범위를 열고 완료/예외 시 ThreadLocal 제거 |
| src/main/java/shop/esjh/memoryjar/config/LoginDiagnosticsConfig.java | 보안 필터 바로 앞에 진단 필터 등록, 기존 보안 정책 유지 |
| src/main/java/shop/esjh/memoryjar/monitoring/JvmGcMetrics.java | GC를 유발하지 않고 JVM 누적 카운터 조회 |
| src/main/java/shop/esjh/memoryjar/monitoring/ResourceUsageEndpoint.java | 기존 Heap·풀 필드 유지, 내부 응답에 gc·loginDiagnostics 추가 |
| src/main/java/shop/esjh/memoryjar/service/LocalAuthService.java | 기존 계정 조회와 비밀번호 검증 호출을 구간별 측정으로 감쌈 |
| src/main/java/shop/esjh/memoryjar/controller/AuthController.java | 인증 서비스 전체·Refresh 트랜잭션·JWT·쿠키 작성 측정 |
| tools/monitoring/collect-resources.py | 5초 간격 GC 증분, Java/DB 프로세스 RSS·스왑·minor/major fault와 증분/초 수집 |
| tools/load/summarize-read-run.mjs | 최근 진단 중복 제거 및 동일 시간 창의 요청·GC·프로세스 카운터 연결 |

의존성·DB 스키마·일반 API 응답·비밀번호 보안 강도·Heap/풀 크기·기존 타임아웃을 바꾸지 않는다.
진단용 부가 계측이며 오버헤드가 0인 것은 아니다. 기존 이미지의 성능 기준본과 구분해야 한다.

## 로그인 단계

| 고정 단계 | 포함 범위 |
| --- | --- |
| CREDENTIAL_LOOKUP | 기존 credential+User 조회. 없는 계정 예외도 동일하게 전달 |
| PASSWORD_VERIFY | 기존 PasswordEncoder.matches 호출. 반환된 false는 원래대로 처리 |
| AUTH_SERVICE | LocalAuthService 프록시 호출 전체. 읽기 트랜잭션 경계와 위 하위 구간을 포함 |
| REFRESH_TRANSACTION | 기존 RefreshTokenService.issue 프록시 호출. 행 잠금·저장·트랜잭션 완료 포함 |
| JWT_CREATE | 기존 JWT 생성 호출 |
| COOKIE_WRITE | 기존 access/refresh 쿠키 작성 호출 |

벽시계 보정의 영향을 피하기 위해 경과 시간은 System.nanoTime으로 잰다.
UTC 시작/완료 시각은 Nginx·k6·OS 표본을 연결할 때 사용한다.
AUTH_SERVICE와 하위 구간은 **중첩**하므로 합산하지 않는다.
필터 전체 시간은 보안 필터·MVC·응답 직렬화 실행을 포함하지만, 필터 진입 전 서버 큐 대기·네트워크는 포함하지 않는다.
Nginx/클라이언트가 499/timeout이어도 애플리케이션은 200 상태로 처리했을 수 있다.
내부 responseStatus가 클라이언트 수신 성공을 증명하지는 않는다.

## 개인정보·수명·보안

- 상세 계측 기본값: app.monitoring.login-diagnostics-enabled=false.
- 승인 후 환경변수 APP_MONITORING_LOGIN_DIAGNOSTICS_ENABLED=true로 명시 활성화한다.
- 아이디·이메일·비밀번호·쿠키·JWT·본문·요청 헤더·예외 메시지를 기록기에 전달하지 않는다.
- 경로는 POST /api/v1/auth/login에 고정하며 사용자 입력으로 metric label을 만들지 않는다.
- 요청별 ThreadLocal은 finally에서 제거하고 최근 완료 기록은 최대 64건이다. 완료 순서 보존이며 ID는 JVM 재기동 시 초기화된다.
- 중첩 호출·동시 요청의 단계 맵은 요청마다 분리한다. 동기 로그인 경로 전용이며 비동기 스레드에 문맥을 전파하지 않는다.
- 공개 응답·로그·응답 헤더에 진단 정보를 추가하지 않는다.
- 기존 컨테이너 loopback 9091 GET /actuator/resources에서만 조회한다. 일반 포트 403, 관리 쓰기·민감 경로 차단은 유지한다.
- 요청 수가 64건을 넘으면 오래된 완료 기록을 버린다. 연속 5초 수집과 실패 후 관측으로 필요한 구간을 보존한다.

## GC와 페이지 폴트의 해석

- gc는 JVM 누적 collectionCount/collectionTimeMillis다. 미지원 값은 null, 구버전 서버는 gcDelta.available=false로 표시한다.
- 요청별 jvmGcCountDelta/jvmGcTimeMillisDelta도 JVM 전체의 차이다. 다른 요청의 GC와 겹칠 수 있고 STW 정지 시간 자체가 아니다.
- Java/DB 컨테이너 메인 프로세스만 읽는다. 현재 java·mariadbd를 가정하며 init/shell 래퍼로 바뀌면 측정을 거절한다.
- minor fault는 보통 디스크 읽기 없이 해결된 fault이며 major fault는 디스크 I/O가 필요한 fault다.
- **major fault는 swap-in 전용 카운터가 아니다.** 실행 파일·라이브러리 페이지 읽기도 포함할 수 있다.
- 프로세스별 RSS/VmSwap은 현재 상태, fault 증분은 약 5초 구간이다. 짧은 로그인 한 단계의 정확한 인과관계를 자동 확정하지 않는다.
- PID/startTimeTicks 변경·카운터 초기화·조회 실패는 정상 0으로 숨기지 않는다. 기존 감시기의 수집 장애 중단 경로를 따른다.
- 기존 schema=1·Heap/풀 필드를 유지하므로 구버전 자료도 읽을 수 있다. 추가 지표로 중단 기준을 임의 변경하지 않는다.

## 검증·배포·재측정 순서

1. Java 진단/개인정보/동시성·기존 로그인·Security 회귀 및 전체 백엔드 test/bootJar 실행.
2. Python 프로세스·GC 파싱 검사와 기존 감시기 22개 검사.
3. internal Docker 네트워크의 실제 HTTP 로그인으로 여섯 구간·GC 필드·일반 포트 차단·민감 정보 미포함 검사.
4. 검증 완료 후 **별도 승인으로** 커밋·푸시·운영 배포. 푸시가 자동 배포를 유발할 수 있으므로 임의 수행하지 않는다.
5. 배포 이미지/설정을 기록하고 명시 활성화 여부를 내부 지표로 확인한다. 아직 false면 상세 요청 기록은 생기지 않는다.
6. 먼저 자원만 관측한 뒤 승인한 전용 계정의 소량 로그인으로 원인을 좁힌다. 50~300 VU부터 재시작하지 않는다.
7. 오류/timeout 시 부하를 중단하고 서버가 뒤늦게 남긴 진단·시험 세션을 확인한다. 기존 실패 자료는 보존한다.

이번 준비에서 운영 배포·진단 활성화·로그인 재시도·부하 재실행은 하지 않는다.

## 2026-10-18 준비 검증 결과

- Java 17 오프라인 전체 test/bootJar/isolatedE2eBundle 성공. 1854개 중 1849개 성공, 격리 전용 5개 skip, 실패 0개.
- 격리 전용 중 HTTP/WebSocket 4개는 internal Docker 환경에서 별도로 모두 성공. 조회용 1개는 이번 단계에서 별도 재실행하지 않았다.
- 실제 로그인 여섯 구간·GC 필드·민감 정보 미포함·일반 포트 403·관리 쓰기/민감 경로 차단 확인.
- IPv4 기본 경로 없음, 공용 IPv4/IPv6·메타데이터 TCP 차단 확인. 호스트 방화벽 전체 또는 DNS 전체 차단을 검증한 것은 아니다.
- 결과: build/isolated-e2e-results/memoryjar-e2e-a3c4f82e09ad/. 생성한 임시 컨테이너/네트워크 잔존 0개.
- 기존 자원 감시기 22개 및 새 프로세스/GC 검사 5개 통과. 대상 변경·카운터 초기화·미측정·GC null·init 래퍼 오인 방지 포함.
- 기존 10 VU 성공/50 VU 준비 실패 자료를 새 분석기로 읽어 결과와 조회 0건/오류율 null 표현 유지 확인.
- 기존 운영 서버를 약 16초간 **관리 지표만** 관측해 프로세스 카운터 조회 권한·구버전 GC 미측정 처리를 확인했다.
- 그 호환성 결과는 build/monitoring/login-diagnostics-collector-compat-20261018/. 로그인/부하/GC 강제 실행 없음.
- Gradle 캐시 권한 제한 때문에 최초 기본 권한 실행은 실패했고, 기존 캐시 접근을 허용한 오프라인 실행으로 최종 검증했다.
- 운영 상세 진단은 아직 미배포·미활성화다. 커밋·푸시·배포는 수행하지 않았다.

관련 테스트 파일: src/test/java/shop/esjh/memoryjar/monitoring/LoginDiagnosticsTest.java,
JvmGcMetricsTest.java, ResourceUsageEndpointTest.java 및
src/test/java/shop/esjh/memoryjar/isolated/IsolatedHttpWebSocketTest.java,
tools/monitoring/test_diagnostics.py, tools/monitoring/test_guard.py.

## 로그인 후 CSRF 지연 계측 확장 (2026-10-18)

위의 준비 검증 결과는 최초 구현 시점의 기록이다. 이후 운영에서 로그인은 200이지만 후속
GET /api/v1/csrf가 3초 timeout/Nginx 499로 끝나는 사례를 관측했다. 이를 나누기 위해
이번 로컬 변경은 다음 범위만 확장한다. 이 절 자체가 운영 배포·측정 완료를 의미하지 않는다.

- 기존 기본 꺼짐 설정과 내부 관리 포트, 최근 64개 상한을 유지한다.
- 허용 경로는 POST /api/v1/auth/login, GET /api/v1/csrf 두 개뿐이다.
- 고정 requestKind(LOGIN/CSRF)를 추가하며 원문 URI·query·토큰·사용자 정보를 보존하지 않는다.
- JWT_VALIDATE는 기존 validate, JWT_CLAIMS_PARSE는 기존 두 번째 파싱 호출 시간이다.
  중복 파싱을 제거하거나 보안 검사를 생략하는 성능 수정은 하지 않는다.
- SESSION_VERSION_QUERY는 기존 Repository 호출 전체다. **연결 획득·트랜잭션·SQL 실행 등을
  포함할 수 있으며, 연결 대기와 순수 SQL 실행 시간을 독립적으로 측정한 값이 아니다.**
- CSRF_CONTROLLER는 컨트롤러 진입 후 토큰 읽기·응답 객체 생성이다. 필터 전체 시간에는
  그 앞의 보안 필터/MVC와 뒤의 직렬화가 포함된다. 필터 진입 전 서버 큐·네트워크는 제외된다.
- API 응답·생성자·인증 결과·예외·트랜잭션 경계는 유지한다. GC는 여전히 JVM 전체 차이다.
- 관리 응답의 loginDiagnostics 필드명은 호환성을 위해 유지하되 recent에는 두 종류가 섞인다.
  분석기는 requestKind가 없는 구버전만 LOGIN으로 해석하고 새 CSRF는 별도 csrfSamples로 분리한다.
  새 측정에서 마지막 recent 항목을 무조건 로그인이라고 가정하면 안 된다.
- 현재 프로브의 후속 CSRF 실패도 로그인 실패와 구분해야 하며, 실패한 전체 흐름을 통과로 바꾸지 않는다.

로컬 검증 후 별도 커밋·배포 승인을 받고 운영에서 소량 재측정한다. 기존 전체 Compose 배포는
시험용 DB 캐시와 진단 설정을 해제할 수 있었다. 아래 API 전용 절차로 이를 보존하되 실제 배포 후에도 확인한다.

### 확장 계측의 로컬 검증

- Node 조회/분석 도구 검사 25개 통과. 새 혼합 진단/구버전 호환 검사 2개를 포함한다.
- Python 자원 수집/중단 정책 검사 27개 통과. 첫 샌드박스 실행은 Windows의 시험 프로세스
  종료 제한으로 실패했고 필요한 로컬 권한으로 재실행해 통과했다. 운영 부하는 실행하지 않았다.
- `tools/isolated/run-e2e.ps1`의 실제 HTTP/WebSocket 검사 4개 통과. 로그인 후 CSRF의
  JWT_VALIDATE·JWT_CLAIMS_PARSE·SESSION_VERSION_QUERY·CSRF_CONTROLLER와 관리 접근 차단 확인.
- 결과: `build/isolated-e2e-results/memoryjar-e2e-acb3b70f9047/`.
  생성한 임시 컨테이너·네트워크 잔존 0개. 외부 IPv4/IPv6·메타데이터 TCP 차단을 확인했으며
  호스트 방화벽 전체나 DNS 전체의 차단을 검증한 것은 아니다.
- Java 17 오프라인 `test bootJar isolatedE2eBundle` 성공. 전체 1,861개 중 1,856개 성공,
  격리 전용 5개 skip, 실패/오류 0개. 이 중 실제 HTTP/WebSocket 4개는 위 격리 환경에서
  별도로 통과했으며 조회 부하 전용 1개는 이번에 별도 재실행하지 않았다.
- `git diff --check` 통과. 프론트엔드·의존성·DB 스키마 변경은 없다.
  위 검증을 운영 지연 해결로 해석하지 않는다.
- 이 확장 변경의 커밋·푸시·운영 배포·실제 로그인 재시험은 아직 수행하지 않았다.

### API 배포 시 시험 설정 보존

- `.github/workflows/deploy.yml`은 검증된 실행의 manifest와 `tools/deploy/deploy-api.py`를 사용한다.
  실행기는 digest를 고정하고 `pull api`, `up -d --no-deps --pull never api`만 실행한다.
  DB 이미지 갱신·설정 적용·재생성은 이 자동 배포의 범위가 아니며 별도 작업이다.
- 서버의 선택 파일 `docker-compose.diagnostics.yml`이 있으면 함께 읽고, 없으면 기본 꺼짐이다.
  `tools/monitoring/diagnostics.override.example.yml`은 진단 플래그만 추가한다.
  기존 이미지 고정용 override를 재사용하면 오래된 API가 배포될 수 있으므로 재사용하지 않는다.
- 기존 DB 캐시 시험 override는 변경하지 않는다. API 전용 배포로 현재 DB를 보존하는 것이며
  캐시 설정의 영구 반영을 완료했다는 의미는 아니다.
- 원복에 필요한 이전 이미지의 자동 prune을 제거했다. 디스크 여유를 배포 전에 확인하고
  이미지 정리는 별도 승인·대상 확인으로 진행한다.
- 배포 후 API 이미지·관리 포트·진단 활성화·Heap/풀을 확인하고 DB ID·기동 시각·캐시값을
  변경 전과 비교한다. 로그인 재시험은 이 확인 뒤에 별도로 진행한다.
- 커밋/digest 연결·동시 배포 방지·실패 시 원복과 제한은 [배포 안전 절차](DEPLOYMENT_SAFETY.md)를 따른다.

## Heap 외 메모리 예산 계측 준비 (2026-10-18)

- 운영 컨테이너에는 jcmd/jstat가 없고 기존 응답은 Heap·GC·DB 풀만 제공했다.
  추가 라이브러리나 에이전트 없이 JVM 기본 MXBean의 집계값을 `jvmMemory` 필드로 추가한다.
- nonHeap은 Heap 외 메모리의 사용·커밋·최댓값, memoryPools는 Metaspace·CodeHeap 및
  Heap 세대별 관리 풀의 종류·사용량이다. bufferPools는 direct/mapped 등의 개수·메모리·용량이다.
- threads는 현재·데몬·최대 동시·누적 시작 개수만 제공한다. 스레드 이름·스택·덤프·환경변수·
  JVM 인자·사용자 데이터는 수집하지 않으며, GC나 새 DB 연결도 요청하지 않는다.
- 미지원 최댓값/버퍼 카운터는 null, 무효화된 풀의 usage도 null이다. 0으로 정상 처리하지 않는다.
- 기존 필드·measurable·수집/중단 기준과 내부 포트 정책은 바꾸지 않는다. 필드 추가는
  원래 응답을 그대로 보존하는 수집기와 호환된다. 일반 API나 DB 스키마 변경은 없다.
- nonHeap은 Metaspace/CodeHeap 등을 포함하므로 memoryPools의 값을 다시 더하지 않는다.
  mapped 버퍼 용량은 실제 상주 메모리가 아니며 Heap/직접 버퍼/OS RSS/스왑도 단순 합산하지 않는다.
  스레드 개수는 스택의 실제 사용량이 아니다. 이 계측은 전체 네이티브 할당을 추적하는 NMT가 아니다.
- 순차 조회한 순간값이며 원자적 스냅샷이 아니다. 기존 GC 지표와 같이 관리 요청에 소량의
  조회·직렬화 비용이 추가된다. 운영 메모리 예산과 성능 판단은 배포 후 실제 표본으로 결정한다.
- 현재 변경은 로컬 준비다. 커밋·푸시·운영 배포·메모리 크기 변경·추가 로그인은 수행하지 않았다.

### Heap 외 계측의 로컬 검증 결과

- Java 17 오프라인 `test bootJar isolatedE2eBundle` 성공. 1,864개 중 1,859개 성공,
  격리 전용 5개 skip, 실패/오류 0개. 새 집계값·미지원/무효화 상태 검사 3개를 포함한다.
- 실제 internal Docker HTTP/WebSocket 검사 4개 통과. `jvmMemory` 직렬화·기존 지표·
  일반 포트 403·관리 listener의 loopback 제한·민감 경로와 쓰기 차단을 확인했다.
- 결과: `build/isolated-e2e-results/memoryjar-e2e-53fcb18488e3/`. 이 응답의 메모리 수치는
  로컬 시험 JVM의 값이지 EC2 운영 수치가 아니다. 생성한 임시 컨테이너·네트워크 잔존 0개.
- 공용 IPv4/IPv6·메타데이터 TCP 차단을 확인했다. 호스트 방화벽 전체/DNS 전체 검증은 아니다.
- Python 수집/중단 검사 27개, Node 조회/분석/배포 구조 검사 27개, `git diff --check` 통과.
- 추가 의존성·프론트엔드·DB 스키마 변경은 없다. 새 계측의 운영 표본·메모리 예산 결정·
  설정 조정·로그인 재시험·부하 재개는 아직 수행하지 않았다.
