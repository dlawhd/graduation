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
