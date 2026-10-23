# Memory Jar 기술 스택·인프라 전체 분류표

작성일: **2026년 10월 23일, 한국 시간**

> 목적: 프로젝트에서 무엇을, 어디에, 왜 사용했는지 구분한다. 기술 이름만 나열하지 않고 **현재 코드 사용 / 의존성 등록 / 시험용 / 운영 기록 / 검토만 함**을 나눠 기록한다.

## 1. 먼저 읽는 핵심 요약

Memory Jar는 **React 화면과 Java·Spring Boot 백엔드, MariaDB**로 만든 서비스다. 백엔드는 하나의 애플리케이션이며, 사진 저장·메일·이미지 심사·AI 생성은 외부 서비스를 연결한다.

| 분야 | 핵심 기술 |
| --- | --- |
| 프론트엔드 | JavaScript, React 19, React Router, Vite 8, Tailwind CSS 4, Axios |
| 화면 효과·제작 도구 | Framer Motion, Three.js, Canvas 2D, SVG, dnd-kit |
| 백엔드 | Java 17, Spring Boot 3.5.10, Spring MVC, Spring Security, Spring Data JPA |
| DB·데이터 접근 | MariaDB 10.11 계열, Hibernate, JDBC, HikariCP, Flyway, SQL·JPQL |
| 인증·보안 | 자체 로그인, Argon2id, JWT, OAuth2, CSRF, CORS, 쿠키, HMAC-SHA256 |
| 실시간 기능 | WebSocket, STOMP, Spring Simple Broker, REST 보충 조회 |
| 파일·메일·심사 | AWS S3, SES v2, Rekognition, AWS SDK for Java v2 |
| AI 생성 | Cloudflare Workers AI REST API, FLUX.2 Klein 4B, Java 이미지 후처리 |
| 지도 | Kakao Maps JavaScript SDK 연동 코드. 미커밋 로컬 작업 포함 |
| 운영 인프라 | AWS EC2, Linux, Nginx, Docker, Docker Compose, Vercel |
| 빌드·배포 | Gradle, npm, Git, GitHub, GitHub Actions, GHCR, Buildx, self-hosted runner |
| 테스트 | JUnit Jupiter, Mockito, AssertJ, MockMvc, Testcontainers, H2, Node.js Test Runner, Playwright, Python unittest, k6 |
| 자체 운영 도구 | Actuator 내부 지표, JVM 관리 API, Python·Shell 자원 수집, 부하 중단·회복 검사, 백업 복원 검증 |

**현재 사용했다고 섞어 쓰면 안 되는 것:** Redis, Kubernetes, 외부 메시지 브로커, 운영 RDS, SSM 대체 배포, Oracle·Google 서비스 이전. 상세 상태는 13장에 있다.

## 2. 기준과 읽는 방법

- 프로젝트: `C:/Users/whdgu/Desktop/graduation`
- 브랜치: `main`
- HEAD(현재 체크아웃한 커밋): `a36d5d4554bd184086dcbc27e0944d3e06c0ee1c`
- 기존 미커밋·미추적 코드도 대상에 포함했다. 특히 지도·쪽지 UI는 커밋된 기준본과 다를 수 있다.
- 버전은 **파일에 선언한 값**과 **잠금 파일이 정한 값**을 구분한다. 운영 서버에 오늘 설치된 버전을 모두 조회한 문서는 아니다.
- 운영 사실은 이전 운영 측정·프로젝트 기록과 현재 코드를 구분해서 적는다. 오늘 클라우드 로그인·SSH·배포를 새로 실행하지 않았다.

| 상태 | 뜻 |
| --- | --- |
| 코드 사용 | 관련 설정·호출·구현을 현재 코드에서 확인 |
| 등록 | 의존성에는 있지만 실제 사용 또는 연결까지 확인하지 못함 |
| 시험·개발 | 서비스 운영 자체가 아니라 개발·검증에 사용 |
| 운영 기록 | 기존 운영 확인 또는 프로젝트 배포 기록에 근거. 오늘 재검증은 아님 |
| 검토·미도입 | 논의·설계·주석은 있으나 현재 운영 기술로 기재하면 안 됨 |

검사 범위는 기술 식별에 필요한 의존성·잠금 파일, 설정, 호출부, 테스트·배포 도구, 관련 문서다. `.git` 내부, 설치된 `node_modules`, `.gradle`, 생성된 `build`·`frontend/dist`, 이미지·폰트 바이너리 전체 의미 분석은 제외한다. 의존성의 의존성인 모든 내부 모듈을 각각 독립 스택으로 부풀리지 않는다. **전체 소스 파일을 한 줄씩 전수 감사했다는 뜻은 아니다.**

## 3. 언어·실행 환경·빌드 도구

| 기술 | 버전·상태 | 사용 위치와 역할 |
| --- | --- | --- |
| Java | 17, 코드 사용 | 백엔드와 이미지 처리 |
| JavaScript·JSX | 코드 사용 | React 화면, 브라우저 동작, Node.js·k6 도구 |
| HTML·CSS | 코드 사용 | 화면 구조, 반응형·스타일·애니메이션 |
| SQL | 코드 사용 | Flyway, DB 제약·조회, 시험 데이터·복원 검증 |
| Python 3 | 개발·운영 도구 | 배포·자원 수집·부하 제어. 별도 Python API 서버는 아님 |
| Bash·Shell | 개발·운영 도구 | 서버 명령, 진단·비교 실행 |
| PowerShell | 개발 도구 | Windows 실행·격리 E2E 보조 도구 |
| YAML·JSON·Markdown | 설정·문서 형식 | Spring·Actions·Compose 설정, API 데이터, 설계 문서 |
| Gradle Wrapper | 8.14.4 | 백엔드 빌드·테스트·실행 JAR 생성 |
| Kotlin DSL | `build.gradle.kts` | Gradle 설정 문법. 백엔드를 Kotlin으로 구현했다는 뜻은 아님 |
| Node.js·npm | 프론트 빌드·시험 | Vite 실행, 의존성 설치, Node 테스트·검증 도구. 로컬 설치 버전은 이번에 확인하지 않음 |
| Eclipse Temurin | Docker의 JDK 17·JRE 17 | 빌드 단계와 실행 단계를 분리 |
| Amazon Corretto | Actions의 Java 17 | GitHub에서 백엔드 테스트 실행. 최종 Docker JRE와 구분 |

기준 파일: [Gradle 설정](C:/Users/whdgu/Desktop/graduation/build.gradle.kts), [Wrapper](C:/Users/whdgu/Desktop/graduation/gradle/wrapper/gradle-wrapper.properties), [Dockerfile](C:/Users/whdgu/Desktop/graduation/Dockerfile).

## 4. 프론트엔드 — 사용자에게 보이는 부분

### 4-1. 직접 등록한 패키지 전체

아래 잠금 버전은 `frontend/package-lock.json` 기준이다. `^`는 허용 범위를 뜻하며, 선언 문자열과 정확한 설치 버전은 다를 수 있다.

| 패키지 | 선언 | 잠금 버전 | 역할·확인 상태 |
| --- | --- | --- | --- |
| react | `^19.2.4` | 19.2.4 | 화면 컴포넌트·상태·훅, 코드 사용 |
| react-dom | `^19.2.4` | 19.2.4 | React를 브라우저 DOM에 표시, 코드 사용 |
| react-router-dom | `^7.13.0` | 7.13.2 | URL·페이지 이동, 코드 사용 |
| axios | `^1.13.4` | 1.13.6 | 공통 API 요청, 코드 사용 |
| tailwindcss | `^4.2.2` | 4.2.2 | 화면 스타일, 코드 사용 |
| @tailwindcss/vite | `^4.2.2` | 4.2.2 | Vite 빌드에 Tailwind 연결 |
| framer-motion | `^12.38.0` | 12.38.0 | 화면 전환·등장·메뉴 애니메이션 |
| three | `0.186.1` | 0.186.1 | 저금통 3D 기하·렌더링 관련 구현 |
| @stomp/stompjs | `^7.3.0` | 7.3.0 | 실시간 STOMP 연결·구독 |
| @dnd-kit/react | `^0.5.0` | 0.5.0 | 첨부 파일 드래그 정렬, 로컬 변경 포함 |
| @dnd-kit/dom | `^0.5.0` | 0.5.0 | dnd-kit 관련 직접 등록 패키지. 직접 import 여부와 별도로 등록 사실을 기록 |
| @testing-library/dom | `^10.4.1` | 10.4.1 | 시험용 라이브러리 등록 |
| @testing-library/jest-dom | `^6.9.1` | 6.9.1 | DOM 검사 확장 등록 |
| @testing-library/react | `^16.3.2` | 16.3.2 | React 시험 도구 등록 |
| @testing-library/user-event | `^13.5.0` | 13.5.0 | 사용자 입력 모사 도구 등록 |
| @vitejs/plugin-react | `^6.0.0` | 6.0.1 | Vite에서 React 처리, 개발 의존성 |
| vite | `^8.0.0` | 8.0.2 | 개발 서버·프론트 빌드, 개발 의존성 |

Testing Library 4종은 현재 `dependencies`에 들어 있지만 용도는 시험이다. 이번 검색에서는 `frontend/src`·`frontend/tests`의 직접 import를 확인하지 못했으므로 **등록만으로 실제 테스트 사용을 단정하지 않는다.** Jest 실행기 자체를 사용하는 구성도 확인하지 못했다.

루트의 별도 `package.json`·`package-lock.json`은 미추적 상태이며 dnd-kit 두 패키지를 등록한다. 실제 프론트 앱의 기준은 `frontend/package.json`이다. 루트 등록을 별도 백엔드나 새 앱으로 해석하지 않는다.

### 4-2. 패키지 밖의 브라우저 기술

| 기술·방식 | 프로젝트에서 하는 일 |
| --- | --- |
| React Context·Hooks | 공통 실시간 연결·화면 상태 관리. Redux·Zustand 사용으로 기록하지 않음 |
| Canvas 2D·ImageData·Blob | 그림판, 지우기·되돌리기, 이미지 합성·PNG 내보내기 |
| Three.js 기하·SVGLoader·브라우저 3D | 저금통 본체·입체 장식·사진 표현. AI의 ‘입체감 있는 그림’과 별도 기능 |
| SVG | 아이콘·저금통 윤곽·입구·장식 |
| Pointer Events | 마우스·터치 입력으로 그리기·조절 |
| CSS Grid·Flex·미디어 쿼리 | PC·모바일 반응형 배치 |
| 접근성 속성 | `aria-*`, 상태·오류 안내, 키보드 초점·동작 |
| Pretendard | 1.3.9 이름의 로컬 WOFF2 가변 폰트 파일과 `@font-face` 연결 |
| Noto Sans KR | CSS의 대체 폰트 이름. 별도 실제 로딩을 확인한 폰트로 기재하지 않음 |
| Kakao Maps JavaScript SDK | 쪽지의 장소 검색·지도 클릭·주소 선택. 지도 버튼을 누를 때 로딩 |

지도는 현재 미추적 로컬 파일에도 구현이 있다. **실제 키·허용 도메인·운영 프론트 재빌드 확인은 별도**다. Kakao 소셜 로그인과 지도 API는 서로 다른 용도다.

근거: [프론트 패키지](C:/Users/whdgu/Desktop/graduation/frontend/package.json), [Vite 설정](C:/Users/whdgu/Desktop/graduation/frontend/vite.config.js), [API 계층](C:/Users/whdgu/Desktop/graduation/frontend/src/api/apiClient.js), [실시간 Provider](C:/Users/whdgu/Desktop/graduation/frontend/src/realtime/StompClientProvider.jsx), [그림판](C:/Users/whdgu/Desktop/graduation/frontend/src/features/jarDesign/components/JarDesignCanvas.jsx), [지도 로더](C:/Users/whdgu/Desktop/graduation/frontend/src/features/note/kakaoMaps.js).

## 5. 백엔드 — 요청과 업무 규칙을 처리하는 부분

### 5-1. 프레임워크·핵심 구성

| 기술 | 버전·역할 |
| --- | --- |
| Spring Boot | **3.5.10**, 서버 설정·실행·의존성 조합 |
| Spring MVC·Spring Web | REST API(HTTP 요청으로 기능·데이터 제공), JSON·파일 요청 처리 |
| 내장 Servlet 서버·Tomcat 계열 | `starter-web`이 제공하는 웹 실행 기반. 정확한 배포 버전은 별도 조회 대상 |
| Spring Security | 인증·인가, OAuth2·CSRF·CORS·필터 체인 |
| Spring Data JPA | Repository를 통한 DB 접근 |
| Hibernate·Jakarta Persistence | Entity와 DB 테이블 연결, ORM(객체와 관계형 DB를 이어주는 방식) |
| Bean Validation·Hibernate Validator | 요청 DTO의 필수·길이·형식 검증 |
| Spring Transaction | 업무 처리의 성공·취소 경계, 명시적 `TransactionTemplate`도 사용 |
| Spring Async·ThreadPoolTaskExecutor | 오래 걸리는 AI 생성 작업을 제한된 별도 스레드에서 실행 |
| Spring Scheduling·ThreadPoolTaskScheduler | 자동 오픈·세션·사진 정리 등 예약 작업 |
| Spring Boot Actuator | 내부 건강 상태·자원 지표 조회 |
| Jackson | JSON 요청·응답·외부 AI 응답 처리 |
| Lombok | 반복되는 접근자·생성자 등 코드 생성, 컴파일 시 사용 |
| SLF4J·로깅 구현 | 서비스·AI 처리 단계·진단 로그. 로그 수집 플랫폼 도입과는 다름 |

Controller → Service → Repository의 계층 구조, Entity와 DTO 분리, 공통 예외·응답 처리를 사용한다. 이것들은 서비스 설계 방식이며 각각 독립 외부 제품은 아니다.

### 5-2. `build.gradle.kts`의 직접 의존성 전체 분류

**운영 기능:**

- `spring-boot-starter-data-jpa`
- `spring-boot-starter-web`
- `spring-boot-starter-actuator`
- `spring-boot-starter-websocket`
- `mariadb-java-client`
- `spring-boot-starter-validation`
- `flyway-core`, 실행 시 `flyway-mysql`
- `spring-boot-starter-security`
- `spring-boot-starter-oauth2-client`
- `bcprov-jdk18on` **1.85.2** — Argon2의 암호 연산 기반
- AWS SDK BOM **2.31.67**과 `s3`, `sts`, `rekognition`, `sesv2`
- Thumbnailator **0.4.20**
- TwelveMonkeys `imageio-webp` **3.13.1**
- JJWT `jjwt-api`, 실행 시 `jjwt-impl`, `jjwt-jackson` — **0.12.5**

**개발·컴파일:**

- Lombok — `compileOnly`, `annotationProcessor`
- Spring Boot Docker Compose 지원 — `developmentOnly`, 운영 배포용 Compose 도구와 구분
- Spring Dependency Management Gradle 플러그인 **1.1.7**

**시험 전용:**

- `spring-boot-starter-test`
- `spring-security-test`
- Testcontainers `junit-jupiter`, `mariadb`
- `h2`
- `spring-boot-testcontainers`
- `junit-platform-launcher`

Redis starter는 주석 처리돼 있다. 버전을 직접 지정하지 않은 라이브러리는 Spring Boot 등의 의존성 관리가 정한다. 임의로 현재 최신 버전이나 로컬 과거 JAR 버전을 채워 넣지 않는다.

## 6. 데이터베이스·동시성·데이터 관리

| 기술·방법 | 역할 |
| --- | --- |
| MariaDB 10.11 계열 | 운영 기록과 로컬 Compose의 관계형 DB. 운영 패치 버전은 오늘 미확인 |
| InnoDB | 트랜잭션·행 잠금 기반. 이전 DB 검사 기록에 사용 확인 |
| MariaDB JDBC Driver | Java에서 MariaDB 연결 |
| HikariCP | DB 연결 풀(연결을 재사용하는 모음). 이전 운영 측정에서 상한 10 확인 |
| Flyway | 버전별 SQL로 DB 구조 변경 이력 관리 |
| JPA Entity·Repository | Java 객체와 DB 연결, 저장·조회 |
| JPQL·Fetch Join·집계 조회 | 필요한 관련 데이터 조회와 불필요한 반복 조회 감소 |
| Pageable·페이지/커서 방식 | 목록을 나눠 읽기. 모든 목록이 같은 페이지 방식인 것은 아님 |
| 비관적 쓰기 잠금 | `PESSIMISTIC_WRITE`: 동시에 바꾸면 안 되는 DB 행을 잠금 |
| UNIQUE·FK·CHECK·인덱스 | 중복·잘못된 관계·허용값을 DB에서도 제한 |
| requestId 기반 멱등 처리 | 같은 채팅 요청이 재전송돼도 중복 저장 방지 |
| 커밋 후 이벤트 전송 | DB 저장 성공 뒤에 실시간 알림 전달 |
| Soft Delete | 일부 데이터에 삭제 시각을 기록해 논리 삭제 |
| JPA Auditing·시간 정책 | 생성·수정 시각 등 관리 |
| SQL 덤프·압축·해시 대조·격리 복원 | 백업 파일뿐 아니라 복원 가능성 검증 도구 |

현재 소스에는 **Flyway V1~V53 SQL 파일 53개**가 있다. 이것은 소스 개수이며 **운영 DB에 V53까지 적용됐다는 오늘의 검증 결과는 아니다.** `ddl-auto: validate`, `open-in-view: false`, Flyway 활성 설정을 확인했다.

로컬 `compose.yaml`은 개발 MariaDB 설정이다. 운영 Compose는 서버 내부에서 관리되므로 로컬 파일을 운영 원본이라고 해석하지 않는다. RDS·Aurora·Cloud SQL을 현재 운영 DB로 기록하지 않는다.

근거: [Spring 공통 설정](C:/Users/whdgu/Desktop/graduation/src/main/resources/application.yml), [운영 연결 설정](C:/Users/whdgu/Desktop/graduation/src/main/resources/application-prod.yml), [마이그레이션 폴더](C:/Users/whdgu/Desktop/graduation/src/main/resources/db/migration), [저금통 Repository](C:/Users/whdgu/Desktop/graduation/src/main/java/shop/esjh/memoryjar/repository/jar/JarRepository.java), [복원 검증 도구](C:/Users/whdgu/Desktop/graduation/tools/isolated/verify-backup-restore.mjs).

## 7. 인증·보안 — 로그인과 접근을 지키는 부분

| 기술·기능 | 역할·구분 |
| --- | --- |
| 자체 아이디·비밀번호 로그인 | Spring Security·자체 인증 Service |
| Argon2id | 비밀번호를 되돌릴 수 없는 값으로 변환. 설정은 메모리 19MiB, 반복 2, 병렬도 1 |
| Bouncy Castle | Argon2 계산에 필요한 암호 라이브러리 |
| JWT·JJWT | Access Token(요청 인증 정보) 발급·검증 |
| Refresh Token·DB 저장 | 로그인 갱신·세션 수명 관리 |
| sessionVersion | 토큰·WebSocket 인증 상태가 현재 유효한지 확인 |
| OAuth2 Client | **Google·Naver·Kakao** 소셜 로그인 설정·처리 |
| HttpOnly·Secure·SameSite 쿠키 정책 | 인증 정보 전달·브라우저 보안 정책. 모든 쿠키의 설정이 동일한 것은 아님 |
| CSRF 토큰 | 쿠키 인증에서 원치 않는 변경 요청 방어 |
| CORS | 허용한 프론트 출처의 요청 처리 |
| 서버·서비스·WebSocket 권한 검사 | 멤버·방장·운영자 등 접근 범위 확인 |
| HMAC-SHA256 | 이메일 인증번호·인증 완료 토큰을 서버 비밀키와 함께 검증용 값으로 저장 |
| SecureRandom·상수 시간 비교 함수 | 예측 어려운 토큰 생성, 비교 처리 |
| 환경변수·GitHub Secrets·기본 AWS 자격 증명 체인 | 비밀값·외부 인증 연결. 실제 IAM 권한 구성은 계정 확인과 구분 |
| 내부 관리 포트 분리 | Actuator를 loopback의 9091에 두고 일반 요청 경로와 분리 |

HTTPS는 통신 암호화이며, HMAC·Argon2는 해시·검증 기술이다. **이들을 ‘모든 쪽지를 AES로 암호화 저장한다’는 뜻으로 설명하지 않는다.** 이번 검사에서 그런 전체 콘텐츠 암호화 구현은 확인하지 않았다.

근거: [SecurityConfig](C:/Users/whdgu/Desktop/graduation/src/main/java/shop/esjh/memoryjar/config/SecurityConfig.java), [PasswordEncoderConfig](C:/Users/whdgu/Desktop/graduation/src/main/java/shop/esjh/memoryjar/config/PasswordEncoderConfig.java), [이메일 인증 암호 처리](C:/Users/whdgu/Desktop/graduation/src/main/java/shop/esjh/memoryjar/auth/EmailVerificationCrypto.java).

## 8. 실시간 통신 — 채팅·알림·변경 전달

| 기술·방식 | 역할 |
| --- | --- |
| WebSocket·WSS | 브라우저와 서버의 지속 연결·암호화된 연결 |
| STOMP | 구독 주소와 메시지 송수신 규칙 |
| Spring WebSocket·Messaging | 서버의 접속·메시지 처리 |
| Simple Broker | **단일 Spring Boot 프로세스 내부**에서 구독자에게 메시지 전달 |
| @stomp/stompjs | 프론트 접속·구독·재접속 |
| React 공통 Provider | 앱 전체의 실시간 연결 공유 |
| REST 보충 조회·Polling | 연결 단절·누락을 보완하는 주기 조회 |
| DB 성공 후 방송·중복 병합 | 저장 결과와 실시간 수신을 연결해 중복·실패 혼동 감소 |

채팅뿐 아니라 알림·멤버 변경·오픈·쪽지·댓글·리액션·AI 결과 등에 사용한다. 현재 Redis Pub/Sub나 RabbitMQ·Kafka를 중간 전달 서버로 사용하는 구조가 아니다.

근거: [서버 WebSocket 설정](C:/Users/whdgu/Desktop/graduation/src/main/java/shop/esjh/memoryjar/config/WebSocketConfig.java), [채팅 화면](C:/Users/whdgu/Desktop/graduation/frontend/src/pages/JarChatPanel.jsx).

## 9. 파일·이미지·AI·외부 API

| 서비스·기술 | 프로젝트에서 하는 일 | 상태 |
| --- | --- | --- |
| AWS S3 | 사진·영상·원본·후보·디자인 파일 저장·조회·정리 | 코드·운영 구성 기록 |
| S3 Presigned URL | 제한 시간 동안 허용되는 업로드·조회 주소 발급 | 코드 사용 |
| AWS SES v2 | 회원가입·계정 관련 인증메일 발송 | 코드·운영 구성 기록 |
| AWS Rekognition | 이미지 심사·정책 위반 여부 확인 | 코드·연동 기록. 오늘 외부 요청 미실행 |
| AWS SDK for Java v2 | S3·SES·Rekognition·자격 증명 연결 | 직접 의존성 사용 |
| AWS STS SDK | 자격 증명 관련 직접 의존성 | 등록 확인. 별도 STS 업무 API 구현으로 과장하지 않음 |
| Cloudflare Workers AI | AI 스타일 이미지 생성 REST API | Java 클라이언트·파이프라인 구현 |
| FLUX.2 Klein 4B | 기본 생성 모델 | 코드 기본 ID `@cf/black-forest-labs/flux-2-klein-4b`; 실제 운영 환경변수로 변경 가능 |
| JDK HttpClient | Java에서 Cloudflare에 HTTP 요청 | 별도 Python·GPU 서버 없이 호출 |
| Jackson·multipart 처리 | AI 요청 구성·응답 파싱 | 코드 사용 |
| Thumbnailator | 이미지 축소·썸네일용 라이브러리 | 직접 의존성 등록. 현재 Java 소스에서 `Thumbnails` 호출·직접 import는 확인하지 못함 |
| Java ImageIO·BufferedImage·Graphics2D | 이미지 판독·검증·합성·정규화·PNG 생성 | 코드 사용 |
| TwelveMonkeys ImageIO WebP | WebP 이미지 판독 플러그인 | 직접 의존성 |
| 자체 PixelPostProcessor | AI 결과를 픽셀 스타일로 후처리 | Java 구현 |
| Kakao Maps SDK | 장소 검색·좌표의 주소 확인 | 로컬 UI 코드, 운영 연결 미검증 |

PIXEL 후처리는 현재 코드에서 1024×1024 입력을 흰 배경 합성 → 96×96 축소 → 최대 64색 팔레트 → 480×480 확대 PNG로 처리한다. 이것은 AI 모델 자체를 훈련한 것이 아니라 **생성 결과를 가공하는 알고리즘 구현**이다.

AI는 Jar 생성 전 Draft(임시 작업물) → 후보 생성·심사·보관 → 최종 생성 구조다. 별도 마이크로서비스·외부 메시지 큐·GPU EC2를 만든 것으로 설명하지 않는다. Cloudflare Workers AI API 사용과 사용자가 직접 Cloudflare Worker 앱을 배포한 것은 다르다.

외부 연동 코드를 확인했다고 모든 실제 계정·결제·모델 호출 성공을 오늘 검증한 것은 아니다. 설계 문서의 ‘완료’만으로 운영 검증까지 완료했다고 판단하지 않는다.

근거: [S3 설정](C:/Users/whdgu/Desktop/graduation/src/main/java/shop/esjh/memoryjar/config/S3Config.java), [SES 설정](C:/Users/whdgu/Desktop/graduation/src/main/java/shop/esjh/memoryjar/config/SesConfig.java), [Rekognition 설정](C:/Users/whdgu/Desktop/graduation/src/main/java/shop/esjh/memoryjar/config/AiDraftConfig.java), [Cloudflare 클라이언트](C:/Users/whdgu/Desktop/graduation/src/main/java/shop/esjh/memoryjar/service/ai/CloudflareWorkersAiClient.java), [PIXEL 후처리](C:/Users/whdgu/Desktop/graduation/src/main/java/shop/esjh/memoryjar/service/ai/PixelPostProcessor.java).

## 10. 인프라 — 프로그램을 어디서 운영하는가?

| 구성 | 역할·근거 상태 |
| --- | --- |
| AWS EC2 | 백엔드·DB 운영 서버. 이전 운영 진단에서 사용 가능 RAM 약 914MiB 확인. 정확한 인스턴스 유형은 여기서 확정하지 않음 |
| Linux·Ubuntu 계열 운영 환경 | 기존 접속·운영 기록 기반. 배포 Ubuntu 사용자와 OS 패치 버전은 별도 구분 |
| Nginx | 프론트에서 온 API 요청을 Spring Boot에 전달하는 리버스 프록시. README와 이전 프로세스 관측에 근거 |
| Docker Engine·containerd | API·DB 컨테이너 실행. 이전 서버 실측에서 프로세스 확인 |
| Docker Compose | API·DB 실행 구성. 로컬 개발 파일과 서버 내부 운영 파일을 구분 |
| Vercel | 프론트 호스팅. README·`frontend/vercel.json`의 SPA 경로 설정에 근거. 오늘 대시보드·운영 버전 재검증은 안 함 |
| HTTPS·WSS·도메인 분리 | 화면·API·실시간 연결. 인증서 발급 업체·DNS 공급자는 이번 검사에서 확정하지 않음 |
| SSH·키 인증·known_hosts 확인 | 서버 진단·관리. 공개 접속 정보와 개인 키는 이 문서에서 제외 |
| AWS 보안 그룹·네트워크 접근 제어 | 접속 허용 관리. 실제 현재 규칙·전체 VPC 구성은 오늘 미확인 |
| Docker volume | MariaDB 데이터의 영속 저장. 이전 운영 조회와 로컬 설정 근거 |
| SSM Agent | 이전 운영 진단에서 실행 프로세스 확인. SSM 대체 배포가 구현됐다는 뜻은 아님 |

DB를 EC2의 Docker에서 운영한다는 기록이지 AWS RDS를 쓴다는 뜻이 아니다. S3를 쓴다고 CloudFront·Route 53·ALB·Auto Scaling까지 사용한 것으로 추가하지 않는다.

```text
브라우저의 React 화면 — Vercel
  ├─ HTTPS API / WSS → EC2의 Nginx → Spring Boot
  │                                      ├─ MariaDB
  │                                      ├─ S3 / SES / Rekognition
  │                                      └─ Cloudflare Workers AI
  └─ 발급받은 제한 주소로 S3 직접 업로드·조회
```

위는 역할 구분도다. 모든 요청이 모든 외부 서비스를 차례대로 호출하는 흐름은 아니다.

근거: [프로젝트 README](C:/Users/whdgu/Desktop/graduation/README.md), [Vercel 설정](C:/Users/whdgu/Desktop/graduation/frontend/vercel.json), [이전 실제 측정 기록](C:/Users/whdgu/Desktop/graduation/docs/FRONTEND_TO_FREE_CLOUD_AND_MEMORY_RECAP_2026-10-22.md).

## 11. CI/CD·배포 — 새 버전을 어떻게 반영하는가?

CI/CD는 테스트·빌드·배포를 자동화하는 흐름이다.

| 도구·방식 | 실제 역할 |
| --- | --- |
| Git·GitHub | 코드 버전·원격 저장소 관리 |
| GitHub Actions | 테스트·이미지 게시·후속 배포 자동 실행 |
| GitHub-hosted Ubuntu runner | Java 테스트·Docker 빌드 실행. 운영 AWS에서 컴파일하는 것이 아님 |
| Gradle Actions 캐시 | 빌드 의존성 재사용 |
| Docker Buildx·다단계 Dockerfile | JDK에서 빌드하고 JRE만 있는 실행 이미지 생성 |
| GHCR | GitHub Container Registry, Docker 이미지 저장소 |
| 커밋 라벨·digest·manifest | 어느 소스의 어떤 이미지를 배포하는지 고정 |
| workflow_run | 같은 저장소 main의 이미지 게시 성공 후 배포 |
| EC2 self-hosted runner | 운영 서버에서 배포 작업을 기다렸다가 실행 |
| 자체 Python 배포 도구 | 검증·API만 교체·상태 검사·실패 복귀 |
| Actions concurrency·서버 flock | 동시에 두 배포가 섞이지 않도록 제어 |
| GitHub Secrets·실행 환경변수 | 인증 정보 주입 |

현재 코드 흐름은 **테스트 → 이미지 게시 → 해당 실행의 manifest 다운로드 → digest 고정 → 기존 DB 유지 확인 → API만 교체 → 상태 검사 → 실패 시 가능한 범위에서 이전 이미지 복귀**다.

별도 프론트 Vercel 배포와 백엔드 Actions 배포를 구분한다. 프론트 브라우저 테스트가 현재 백엔드 CI에서 자동 실행된다고 쓰지 않는다.

**README와 현재 코드의 차이:** README의 배포 상세에는 아직 `latest` 기반 전체 Compose 갱신·prune, 상태 검사·복귀 없음, `cancel-in-progress: true`라는 과거 설명이 남아 있다. 현재 `.github/workflows/deploy.yml`·`tools/deploy/deploy-api.py`는 digest 고정·API 전용 교체·검사·복귀, `cancel-in-progress: false`를 사용한다. 이 문서는 실제 코드를 기준으로 정리했고 README를 임의 수정하지 않았다.

근거: [이미지 게시](C:/Users/whdgu/Desktop/graduation/.github/workflows/publish-ghcr.yml), [배포 워크플로](C:/Users/whdgu/Desktop/graduation/.github/workflows/deploy.yml), [배포 도구](C:/Users/whdgu/Desktop/graduation/tools/deploy/deploy-api.py), [배포 경로 검사](C:/Users/whdgu/Desktop/graduation/tools/monitoring/deploy-workflow.test.mjs).

## 12. 테스트·성능·모니터링·복구

### 12-1. 테스트 도구

| 기술 | 용도·상태 |
| --- | --- |
| JUnit Jupiter·JUnit Platform | Java 단위·통합 시험·격리 실행 |
| Mockito·Spring `@MockitoBean` | 외부 의존성을 대역으로 교체해 서비스·권한·실패 검사 |
| AssertJ | 읽기 쉬운 Java 검증문 |
| Spring Boot Test·MockMvc·Security Test | HTTP·컨트롤러·인증·인가 검사 |
| Testcontainers·MariaDBContainer | 임시 실제 MariaDB에서 Repository·제약·동시성·마이그레이션 검사 |
| H2 | 시험 전용 DB 의존성. 운영 DB가 아님 |
| Node.js 내장 Test Runner·assert | 프론트 순수 로직·API 계약·배포 연결 조건 검사 |
| Playwright·Chromium/Chrome | 실제 브라우저에서 화면·입력·회귀 검사. 테스트 파일은 외부 모듈 경로도 지원 |
| Testing Library 4종 | 의존성 등록. 실제 호출 확인과 구분 |
| Python unittest·mock | 배포·수집 실패·원복·중단·세션 정리 도구 검사 |
| k6 | 가상 사용자 요청·응답시간·오류율 시험 |
| 격리 E2E 도구 | 운영 비밀값·실제 외부 API와 분리해 흐름·백업 복원 확인 |

Playwright는 프론트 직접 의존성 목록에 없지만 브라우저 시험 코드에서 사용한다. Testing Library의 등록과 실제 Playwright 사용을 반대로 기록하지 않는다. k6 스크립트는 Node 테스트 코드와 같은 JavaScript 문법을 사용해도 실행 환경은 다르다.

### 12-2. 자체 관측·운영 기술

| 기술·방식 | 읽거나 확인하는 내용 |
| --- | --- |
| Actuator `health`·자체 `resources` | 서버 건강, 힙·DB 연결 풀·GC·비힙·스레드 집계 |
| Java ManagementFactory·MXBean | JVM 내부 메모리·GC·스레드·버퍼 정보 |
| SLF4J·MDC·단계별 진단 | 요청 흐름·AI 단계 시간·로그인 지연 구간 |
| Linux `/proc`·cgroup v2 | RSS·PSS·스왑·CPU·디스크 대기·컨테이너 제한 |
| SSH·nsenter·curl | 공개 포트를 열지 않고 내부 관리 지표 읽기 |
| Python 수집기·JSONL | 일정 간격 표본 수집·실패를 실패로 기록 |
| 부하 감시·중단 도구 | 자원 위험·수집 실패 때 시험 중단, 종료 후 회복 확인 |
| 준비·조회·정리 분리 | 로그인 준비 실패를 조회 성능 성공·실패로 섞지 않기 |
| p95·오류율·회복 지표 | 응답의 95%가 끝나는 시간, 실패 비율, 종료 후 안정화 |
| SHA-256·압축·격리 복원 | 백업·배포 산출물 일치·복구 검사 |
| G1 GC·Java 힙 옵션·스왑 정책 비교 | 이전 운영 진단·설정·실험 기록. 관측 도구 제품과 구분 |

Prometheus·Grafana·Sentry·ELK를 설치한 중앙 모니터링으로 기재하지 않는다. 자체 Actuator와 수집 스크립트가 존재하는 상태다. **테스트 도구가 있고 과거 실행 기록이 있다는 사실은 현재 100~300 VU 합격이나 무중단 운영 보장이 아니다.**

근거: [테스트 소스](C:/Users/whdgu/Desktop/graduation/src/test), [브라우저 검사](C:/Users/whdgu/Desktop/graduation/frontend/tests), [부하 도구](C:/Users/whdgu/Desktop/graduation/tools/load), [모니터링 도구](C:/Users/whdgu/Desktop/graduation/tools/monitoring), [격리 도구](C:/Users/whdgu/Desktop/graduation/tools/isolated), [JVM 집계](C:/Users/whdgu/Desktop/graduation/src/main/java/shop/esjh/memoryjar/monitoring/JvmMemoryMetrics.java).

## 13. 검토·시도했지만 현재 서비스 운영과 구분할 기술

| 항목 | 정확한 상태 |
| --- | --- |
| Redis starter·Pub/Sub 초안 | 의존성 비활성·주석 초안. 현재 캐시·실시간 중계·분산락에 사용한 것으로 쓰지 않음 |
| Kubernetes·HPA | 현재 운영 구성 확인 안 됨. Docker Compose와 혼동 금지 |
| RabbitMQ·Kafka·외부 STOMP 브로커 | 현재 메시지 전달 기반으로 확인 안 됨 |
| Oracle Cloud A1·AMD Micro | 계정·네트워크·자리 조회·생성 시도 기록. 마지막 제공 결과 자리 부족, 서비스 이전 안 함 |
| OCI CLI·Cloud Shell·Resource Manager·Terraform | Oracle 준비·용량 조회·Plan/Apply 시도에 사용. 현재 AWS 운영을 Terraform으로 구축했다는 뜻은 아님 |
| Google Cloud·Compute Engine·무료 체험 | 계정·혜택·체험 종료 확인. 현재 서비스 호스팅으로 이전 안 함 |
| AWS SSM 대체 배포 | Agent 프로세스 관측, 대체 경로 설명만 함. 온라인 등록·권한·배포 전환 미검증 |
| GitHub OIDC 기반 AWS 배포 | 제안 단계. 기존 배포가 OIDC로 동작한다고 쓰지 않음 |
| URLConnection 기반 AWS HTTP 교체·Netty 제거 | Java 경량화 후보. 아직 미적용 |
| RDS·Aurora·Cloud SQL | 현재 운영 DB로 확인 안 됨 |
| CloudFront·ALB·Auto Scaling·Route 53 | 사용 여부를 입증할 설정·계정 확인 부족. 임의 추가 금지 |
| Spring WebFlux·QueryDSL·MyBatis | 현재 핵심 의존성·조회 기반으로 확인 안 됨 |
| TypeScript·Next.js·Redux·Zustand | 현재 프론트 핵심 스택으로 확인 안 됨 |
| Swagger/OpenAPI UI | 현재 자동 API 문서 도구로 확인 안 됨. Markdown API 문서와 구분 |
| AI 자체 모델 학습·전용 GPU 서버 | 구현한 것으로 확인 안 됨. 외부 생성 API·Java 후처리 사용 |

## 14. 문서·개발 환경까지 구분하기

- **Markdown·SQL 설계 문서:** 프로젝트 개요, API, DTO, ERD, AI 설계·마이그레이션·검증 기록.
- **SVG 구성도:** 저장소의 시스템·배포 흐름 이미지. 특정 다이어그램 SaaS 사용을 뜻하지 않는다.
- **IntelliJ 관련 `.idea` 폴더·Windows PowerShell 환경:** 개발 환경 흔적. 개발자의 모든 IDE·플러그인 사용 이력이나 버전까지 검증한 것은 아니다.
- **GitHub Actions 자동 시험과 로컬 수동 시험:** 실행 위치가 다르므로 ‘모든 시험 자동화 완료’라고 쓰지 않는다.
- **외부 AI 개발 보조 도구와 서비스 런타임 AI:** 개발 대화에 사용한 도구를 Memory Jar 서버의 의존성으로 넣지 않는다. 서비스 생성 코드는 Cloudflare Workers AI 연결이다.

API·DTO·ERD 문서에는 과거 기준과 후속 증분이 함께 있다. 예를 들어 ERD 본문의 V1~V33 표기만으로 현재 SQL 소스가 V33에서 끝난다고 판단하지 않는다. 문서의 구현·검증 상태와 현재 코드를 구분한다.

## 15. 포트폴리오에 바로 쓸 수 있는 짧은 정리

> Java 17·Spring Boot 3.5 기반 백엔드와 React 19·Vite·Tailwind CSS 기반 프론트엔드로 Memory Jar를 개발했다. MariaDB·Spring Data JPA·Flyway로 데이터를 관리하고, Spring Security·JWT·OAuth2와 Argon2id로 인증을 구성했다. WebSocket·STOMP·Simple Broker로 채팅과 알림을 처리하며, Canvas·Three.js로 저금통 제작·시각화를 구현했다. AWS S3·SES·Rekognition과 Cloudflare Workers AI를 연결하는 코드를 구성했고, Docker·GitHub Actions·GHCR 기반 백엔드 배포 및 Vercel 프론트 호스팅 구성을 사용한다. JUnit·Mockito·Testcontainers·Playwright·k6와 자체 자원 수집·복원 도구로 기능·실패·부하를 검증하는 환경을 마련했다.

실제 운영 성공 범위·성능 수치·지도 연결·SSM 전환 등은 각 검증 기록을 덧붙여 설명한다. **Redis·Kubernetes·마이크로서비스·분산 캐시·AI 자체 학습을 이미 도입한 것처럼 추가하지 않는다.**

## 16. 확인하지 못한 사항과 이번 작업 결과

### 아직 별도 확인이 필요한 것

1. 오늘의 EC2 유형·OS·Nginx·Docker·DB 패치 버전, 전체 네트워크·IAM·DNS·인증서 구성.
2. Vercel의 실제 현재 배포 버전과 별도 대시보드 설정.
3. 모든 외부 API의 실제 계정·과금·권한·운영 호출 성공 상태.
4. 미커밋 지도·쪽지 코드의 최종 반영, 전체 브라우저·기기 검증.
5. 모든 간접 의존성의 정확한 운영 버전. 패키지의 존재는 실제 클래스 로딩·메모리 점유 증명과 다름.
6. 현재 전체 시험 통과 여부. 이번 기술 목록 작업에서는 빌드·테스트·부하 시험을 재실행하지 않음.

### 이번에 한 작업

- 현재 Git 상태·HEAD와 직접 의존성·잠금 버전 확인.
- 프론트·백엔드·DB·외부 호출·실시간·보안·배포·시험 도구의 관련 코드와 설정 대조.
- 현재 배포 코드와 README 상세 설명의 차이 보고.
- 이 문서만 추가. 기존 미커밋 작업·운영 설정 보존. 커밋·푸시·패키지 설치·서비스 재시작·외부 유료 호출 없음.
- 문서 검사: 로컬 링크 37개 모두 존재, 코드 블록 짝 정상, 줄 끝 불필요한 공백 0건, 정한 민감정보 패턴 일치 0건. `git diff --check` 통과. 기존 파일의 LF/CRLF 경고는 있었으나 이번에 해당 파일을 수정하지 않았다.

이 문서는 **프로젝트 기술 식별과 상태 분류를 위한 목록**이다. 전체 파일의 의미 분석 완료, 보안 감사 완료, 운영 정상 보증을 뜻하지 않는다.
