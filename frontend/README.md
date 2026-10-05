# Memory Jar — Frontend

React 19 · Vite 8 · Tailwind CSS 4 기반의 반응형 웹 UI입니다.
서비스 소개·설계·백엔드 설정·검증 결과는 [프로젝트 README](../README.md)를 확인합니다.

## 개발 서버

Node.js 22.12 이상과 npm을 준비합니다. 명령은 `frontend`에서 실행합니다.
백엔드는 별도로 구동해야 하며, API·WebSocket 주소를 프론트와 같은 로컬 호스트 기준으로 설정합니다.

```powershell
npm ci
$env:VITE_API_BASE_URL = 'http://localhost:8080'
$env:VITE_WS_BASE_URL = 'ws://localhost:8080/ws'
npm run dev
```

- 주소: `http://localhost:3000`. 포트가 사용 중이면 `strictPort` 설정에 따라 시작하지 않습니다.
- 환경변수 대신 개인 `.env.local`을 사용할 수도 있습니다. 비밀값은 프론트 환경변수에 넣지 않습니다. `VITE_` 값은 브라우저에 공개됩니다.
- 소셜 로그인·쿠키·CORS 설정은 [로컬 개발 안내](../docs/LOCAL_DEVELOPMENT.md)를 함께 확인합니다.

## 빌드와 미리보기

```powershell
npm run build
npm run preview
```

출력 폴더는 `dist`입니다. 미리보기 주소는 터미널 출력으로 확인합니다.
`npm start`, `npm test`, `npm run eject`는 현재 `package.json`에 정의되어 있지 않습니다.

## 유틸리티 테스트

```powershell
$testFiles = @(Get-ChildItem src -Recurse -Filter '*.test.mjs' | ForEach-Object { $_.FullName })
node --test $testFiles
```

Linux·macOS에서는 `node --test src/features/jarDesign/*.test.mjs src/features/jarDetail/utils/*.test.mjs`을 사용합니다.
브라우저 회귀·디자인 미리보기 파일은 `tests`에 있습니다. Playwright 모듈·Chrome 등 별도 실행 조건은 [로컬 검증 안내](../docs/LOCAL_DEVELOPMENT.md#먼저-코드-검증하기), 검증 범위는 [루트 README](../README.md#테스트와-검증)에 설명합니다.
