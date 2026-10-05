# Memory Jar — 로컬 개발과 검증

[프로젝트 README로 돌아가기](../README.md#로컬-실행)

## 준비

- JDK 17과 Gradle Wrapper. Gradle을 별도 설치할 필요는 없습니다.
- Node.js 22.12 이상과 npm. Vite·React 플러그인의 요구 범위는 `^20.19.0 || >=22.12.0`입니다.
- 실행 중인 Docker 엔진: MariaDB Testcontainers 통합 테스트에 필요합니다.
- 전체 서비스 구동에는 별도의 MariaDB 10.11 개발 DB와 외부 서비스 설정이 필요합니다. **백엔드 테스트는 운영 인증정보 없이 실행할 수 있습니다.**

```bash
git clone https://github.com/dlawhd/graduation.git
cd graduation
```

## 먼저 코드 검증하기

프로젝트 루트에서 실행합니다. 테스트는 기본으로 `test` 프로필을 사용하고, 통합 테스트용 MariaDB는 Testcontainers가 준비합니다. 최초 실행은 의존성·Docker 이미지 다운로드에 시간이 걸릴 수 있습니다.

```powershell
# Windows PowerShell
.\gradlew.bat test bootJar --console=plain

# MariaDB 동시 요청과 V48 업그레이드만 선택 실행
.\gradlew.bat test --tests '*WriteSafetyIntegrationTest' --tests '*AiCandidateCleanupV48MigrationTest' --console=plain
```

Linux·macOS에서는 `./gradlew test bootJar --console=plain`을 사용합니다. 백엔드 테스트 보고서는 실행 후 `build/reports/tests/test/index.html`에서 확인할 수 있습니다.

```powershell
# 프론트 검증 · Windows PowerShell
cd frontend
npm ci
$testFiles = @(Get-ChildItem src -Recurse -Filter '*.test.mjs' | ForEach-Object { $_.FullName })
node --test $testFiles
npm run build
```

Linux·macOS 프론트 테스트 명령은 `node --test src/features/jarDesign/*.test.mjs src/features/jarDetail/utils/*.test.mjs`입니다. 빌드 출력은 `frontend/dist`입니다. `npm test`·`npm start`는 현재 scripts에 없습니다.

브라우저 테스트는 별도의 Playwright 모듈과 Google Chrome이 필요합니다. 현재 `frontend/package.json`에 Playwright가 선언되어 있지 않으므로 `npm ci`만으로는 실행되지 않습니다. 스크립트는 `PLAYWRIGHT_MODULE`로 모듈 경로를, `TEST_BASE_URL`로 로컬 Vite 주소를, `TEST_VIEWPORT_WIDTH`로 화면 너비를 지정할 수 있습니다. 테스트 HTML은 `frontend/tests`에 있으며 운영 라우트가 아닙니다.

<details>
<summary><strong>전체 서비스 구동을 위한 설정과 실행</strong></summary>

개발 전용 DB·계정을 먼저 준비합니다. 로컬 `compose.yaml`과 `application-local.yml`은 Git에서 제외되어 있어 새 clone에 포함되지 않습니다. 아래 환경변수는 **자신의 개발 환경 값**으로 준비하며 운영 DB를 연결하지 않습니다.

| 설정 | 용도 |
| --- | --- |
| `SPRING_DATASOURCE_URL` | 개발 DB JDBC URL. 예: `jdbc:mariadb://localhost:3308/memoryjar_dev` — 실제 생성한 DB·포트 사용 |
| `SPRING_DATASOURCE_USERNAME`, `SPRING_DATASOURCE_PASSWORD` | 개발 DB 계정 |
| `APP_JWT_SECRET` | 충분한 길이의 별도 무작위 JWT 서명 키, UTF-8 최소 32바이트 |
| `APP_EMAIL_VERIFICATION_SECRET` | JWT 키와 구분한 이메일 인증용 비밀값 |
| `SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_NAVER_CLIENT_ID`, `SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_NAVER_CLIENT_SECRET` | 네이버 OAuth2 등록 정보 |
| `SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GOOGLE_CLIENT_ID`, `SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GOOGLE_CLIENT_SECRET` | Google OAuth2 등록 정보 |
| `SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_KAKAO_CLIENT_ID`, `SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_KAKAO_CLIENT_SECRET` | 카카오 OAuth2 등록 정보 |
| `APP_S3_REGION`, `APP_S3_BUCKET`, `APP_S3_PUBLIC_BASE_URL` | 개발 S3 파일 저장·조회 설정 |
| `APP_SES_REGION`, `APP_SES_FROM_EMAIL` | SES 리전과 인증된 발신 주소 |
| `APP_AI_CLOUDFLARE_ACCOUNT_ID`, `APP_AI_CLOUDFLARE_API_TOKEN` | AI 변환을 사용할 때 필요한 Cloudflare 정보 |

AWS 클라이언트는 `DefaultCredentialsProvider`를 사용합니다. 로컬 AWS 프로필·환경변수 또는 실행 환경의 IAM 역할로 필요한 S3·SES·Rekognition 권한을 준비합니다. 소셜 로그인 공급자에는 `http://localhost:8080/login/oauth2/code/{naver|google|kakao}`에 해당하는 리디렉션 URI를 등록합니다. 세 공급자의 등록이 코드에 포함되어 있어 각각의 클라이언트 설정이 필요합니다.

필요한 설정을 주입한 후 프로젝트 루트에서 실행합니다.

```powershell
$env:SPRING_PROFILES_ACTIVE = 'local'
$env:SPRING_DOCKER_COMPOSE_ENABLED = 'false'
$env:APP_FRONTEND_URL = 'http://localhost:3000'
$env:APP_COOKIE_SECURE = 'false'
$env:APP_COOKIE_SAMESITE = 'Lax'
$env:APP_COOKIE_DOMAIN = ''
.\gradlew.bat bootRun
```

DB를 직접 준비하므로 Spring Boot의 Compose 자동 기동을 끕니다. 위 쿠키 설정은 로컬 HTTP 전용입니다. 운영에서는 HTTPS와 운영 보안 설정을 유지합니다. 개인 `application-local.yml`이 있으면 환경변수와 함께 실제 설정을 확인합니다. Flyway는 연결된 DB에 마이그레이션을 적용하므로 반드시 개발 전용 DB를 사용합니다.

다른 터미널의 `frontend`에서 실행합니다.

```powershell
$env:VITE_API_BASE_URL = 'http://localhost:8080'
$env:VITE_WS_BASE_URL = 'ws://localhost:8080/ws'
npm run dev
```

브라우저는 `http://localhost:3000`으로 접속합니다. 프론트·API·쿠키의 호스트를 맞추기 위해 `localhost`와 `127.0.0.1`을 섞지 않습니다. Vite의 포트는 3000, `strictPort`는 활성화되어 있으므로 다른 프로세스가 사용 중이면 기존 프로세스를 확인합니다.

실제 이메일 발송·이미지 저장·AI 생성에는 외부 자격증명과 공급자 설정이 필요하며 비용이 발생할 수 있습니다. 현재 저장소는 외부 기능까지 모두 동작하는 오프라인 데모 모드를 제공하지 않습니다. 비밀값을 README·스크린샷·Git에 저장하지 않습니다.

</details>
