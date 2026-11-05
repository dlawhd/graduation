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

## 쪽지의 지도 장소 선택

장소는 직접 입력하거나 별도 네이버 지도 팝업에서 고를 수 있습니다. 지도 버튼을 눌렀을 때만 SDK를 불러오며,
같은 입력칸에서 상호명과 도로명·지번 주소를 검색합니다. 주소 형태는 Maps Geocoding부터,
그 외 입력은 서버 지역 검색부터 조회하며, 정상적인 빈 결과에만 다른 검색을 한 번 시도합니다.
검색 결과는 지도에도 클릭 가능한 번호·이름/주소 표시로 나타나며 목록과 선택 상태를 공유합니다.
선택을 확정하면 상호명 결과는 `상호명, 주소`, 주소 결과와 지도 직접 클릭은 주소만 입력합니다.
네이버 배경 지도에 인쇄된 글씨 자체를 선택하는 기능은 아닙니다.
`이 장소 사용`을 눌러야 입력칸에 반영됩니다. 닫기·취소·실패 시 기존 입력값은 유지합니다.
팝업은 PC·모바일 화면에 맞춰 열리며, 지도 바깥의 크기만 감지해 지도가 반복해서 작아지는 것을 막습니다.

- 프론트 빌드 설정: `VITE_NAVER_MAP_KEY_ID` — 네이버 클라우드 **Maps의 공개 Key ID**.
- Maps Application에서 **Dynamic Map·Geocoding·Reverse Geocoding**을 활성화합니다. 주소 검색은 기존 `geocoder` SDK 모듈을 사용하므로 프론트 Secret이나 새 라이브러리가 필요하지 않습니다.
- 백엔드 실행 설정: `NAVER_LOCAL_SEARCH_CLIENT_ID`, `NAVER_LOCAL_SEARCH_CLIENT_SECRET` — 네이버 클라우드 **NAVER API HUB → 지역**의 키. 기존 네이버 로그인 앱의 키는 사용할 수 없습니다.
- 검색 Secret은 서버에만 두며 `VITE_` 변수, Git, 브라우저 응답에 넣지 않습니다.
- 카카오 지도용 키는 이 기능에서 더 이상 사용하지 않습니다. 네이버·카카오 소셜 로그인 설정은 별개입니다.
- 저장 형식은 기존 `location` 문자열(100자)을 유지하며 좌표·DB 컬럼은 추가하지 않습니다.
- 실제 키 발급, 허용 URL 등록, IntelliJ·Vercel 설정 및 검증 방법은 [네이버 지도 연결 안내](../docs/NAVER_LOCATION_SETUP.md)를 참고합니다.

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
