# 운영자 추가 인증 제거와 분할형 운영 문의함

> 최종 상태: 비교 예시 중 분할형을 실제 운영 문의 화면 코드에 적용했다. 실제 서비스에 배포한 상태는 아니다.

## 1. 수정한 파일

- `frontend/src/pages/SupportInquiriesPage.jsx`: 추가 인증 게이트 제거. 일반·운영 문의의 기존 목록·상세를 재사용한다.
- `frontend/src/features/support/OperatorSupportInbox.jsx`, `useOperatorSupportInbox.js`, `operatorInbox.css`: 운영자 전용 분할 화면, 권한·목록·커서·실시간 갱신과 반응형 스타일을 담당한다.
- `frontend/src/features/support/SupportInquiryDetail.jsx`: 일반·게스트 문의를 유지하며 운영 분할 배치·문의별 작성 상태 복원·보조 정보 접기·쓰기 성공 직후 목록 갱신을 지원한다.
- `frontend/src/api/apiClient.js`: 운영자 MFA 전용 오류 이벤트 제거. 일반 로그인 갱신·CSRF 처리는 유지한다.
- `src/main/java/shop/esjh/memoryjar/controller/support/SupportAdminController.java`: 모든 운영 요청에서 로그인과 운영자 허용 목록을 먼저 검사한다.
- `src/main/resources/application.yml`: 사용하지 않는 MFA 환경변수 설정 제거.
- MFA 전용 Controller·Service·암호화·Entity·Repository·예외 처리·프론트 API·이벤트·게이트·등록 도구·전용 테스트 제거.
- `src/test/java/shop/esjh/memoryjar/security/SupportOperatorAccessHttpTest.java`, `config/SecurityConfigTest.java`, `isolated/IsolatedSupport300Test.java`: 현재 운영자 접근 규칙으로 검증과 시험 준비를 변경한다.
- `tools/ui/operator-inbox-preview.jsx`, `operator-inbox-preview.css`, `render-operator-inbox-previews.mjs`: 실행 가능한 문의함 비교 예시와 캡처 도구.
- `tools/ui/operator-inbox.browser.mjs`: 실제 문의 페이지와 API 계층을 로컬 대역 서버·격리 Chrome에서 검증하고 결과를 캡처한다.
- `docs/API.md`, `DTO.md`, `OPERATOR_SECURITY_2026-11-10.md`, `tools/ui/README.md`: 현재 계약·과거 이력·화면 확인 방법 정리.

## 2. 기존 동작

운영자로 로그인해도 MFA 암호화 키가 설정되지 않으면 문의함 대신 설정 필요 안내가 표시됐다. 코드에는 키 설정·인증 앱 등록·6자리 번호·복구 코드·15분 유효 시간 흐름이 있었다.

기존 문의 목록은 카드·상태 선택 메뉴와 별도 상세 화면을 사용했다. 문의를 바꾸면 운영 답변 입력 상태를 이어갈 수 없었다.

## 3. 변경한 동작

운영자가 로그인하면 별도 인증 앱 등록 없이 기존 문의 목록에 진입한다. 서버의 운영자 허용 목록에 없는 사용자는 403, 비로그인은 401로 차단한다. 목록·상세·대화·첨부 조회와 답변·해결·재문의·첨부 업로드 모두 같은 검사를 통과해야 한다. 문의 응답의 `Cache-Control: no-store`는 유지한다.

인증된 사용자도 CSRF 검증 없이 변경 요청을 보낼 수 없다. 일반·게스트 문의의 접근 규칙과 비공개 첨부파일 정책은 변경하지 않았다.

- PC는 목록과 대화를 좌우로, 모바일은 위아래로 표시한다. 문의가 길어져도 목록을 스크롤해 선택할 수 있다.
- 서버 상태 필터와 기존 12건 커서 페이지를 재사용한다. 문의 선택 자체는 목록 재조회를 발생시키지 않는다. 알림의 상세 링크·브라우저 뒤로 가기를 유지한다.
- 접수 정보와 첨부 입력을 접을 수 있다. 원본·첨부 열람, 이전 대화, 답변, 추가 정보 요청, 확인 중·해결·재문의 기능은 기존 API에 연결한다.
- 작성 내용·선택 파일·추가 정보 요청 여부·전송 번호는 현재 계정·문의별로 메모리에만 보관한다. 다른 문의를 선택했다 돌아와도 복원되며, 성공적으로 보내거나 계정을 바꾸면 정리한다. 문의함을 벗어나거나 새로고침하면 사라진다. 미전송 내용이 있으면 새로고침·창 종료 확인을 요청한다. SPA에서 다른 화면으로 이동하는 경우까지 막는 기능은 아니다.
- 쓰기·이미지 준비 중 중복 요청과 목록 전환을 방지한다. 응답 유실 후 같은 답변은 기존 요청 번호로 재시도한다.
- 실시간 변경·연결 복구·탭 복귀 시 목록과 선택한 문의를 갱신한다. 쓰기 성공 시 상세 재조회 완료를 기다리지 않고 목록도 갱신한다. 현재 필터나 페이지 밖의 문의를 선택한 경우 그 사실을 안내한다.
- 조회 오류·빈 목록·없는 문의를 구분한다. 권한이 취소되면 문의와 작성 내용을 숨기고 지운다. 늦은 응답은 이전 계정·다른 문의에 반영하지 않는다.

## 4. 변경 이유

사용자가 운영자 추가 인증 제거를 명시적으로 요청했다. 설정되지 않은 기능 때문에 운영 문의를 처리할 수 없는 흐름을 해소하고, 기존 서비스 디자인으로 가능한 문의함 구성을 비교할 수 있게 했다.

이후 분할형을 선택해 실제 운영 문의함에 적용하도록 요청했다. 기존 문의 처리 규칙을 유지하면서 목록과 답변 사이의 이동을 줄이고, 문의 전환 때 답변이 사라지지 않도록 보완했다.

## 5. 성능·보안·유지보수

- MFA 상태 조회·등록·검증·만료 처리와 관련 코드를 제거했다. 별도 의존성은 추가하지 않았다.
- 기존 운영자 검사와 로그인·CSRF·첨부 권한은 유지한다. 추가 인증이라는 별도 보호 계층은 사용자 요청에 따라 제거된다.
- 기존 Flyway `V61__operator_additional_authentication.sql`과 이미 생성된 테이블은 보존한다. 과거 마이그레이션을 수정하거나 운영 DB를 삭제하지 않는다. 남은 테이블은 현재 코드에서 사용하지 않는다.
- 로컬 비공개 설정 파일이나 실제 인증 키를 소스·예시에 복사하지 않았다.
- 화면 예시는 운영 빌드 진입점에 포함하지 않는다. 현재 문의 DTO와 상태 필터를 기준으로 구성하며 서버에 없는 전역 통계·전체 검색은 표시하지 않는다.
- 운영 화면은 기존 API·DTO·DB를 그대로 사용한다. 목록·상세 조회를 분리하고 요청 취소·요청 번호 검사를 사용해 불필요한 재조회와 오래된 응답 덮어쓰기를 막는다. 답변·파일은 localStorage나 sessionStorage에 기록하지 않는다.

## 6. 실행한 검증

```powershell
.\gradlew.bat --offline test --tests '*SupportOperatorAccessHttpTest' --tests '*SecurityConfigTest' --tests '*Support*Test' bootJar --console=plain

# frontend 디렉터리
$tests = @(rg --files src -g '*.test.mjs')
node --test $tests
npm.cmd run build -- --outDir ../build/operator-inbox/frontend

# 저장소 루트
node tools/ui/render-operator-inbox-previews.mjs
node tools/ui/operator-inbox.browser.mjs
```

## 7. 결과와 예시

- 관련 백엔드: 103건 중 102건 통과, 실패 0, 조건부 제외 1. 백엔드 JAR 빌드 성공. 전체 백엔드 테스트를 실행한 결과는 아니다.
- 프론트 Node 테스트: 352건 통과, 실패 0. 프론트 빌드 성공. 기존 큰 청크 경고는 남아 있다.
- 실제 페이지 브라우저 통합 검증: **21개 시나리오 통과**. 필터·커서·조회 실패/재시도·늦은 응답·작성 내용/첨부 복원·연속 전송·응답 유실 후 멱등 재시도·CSRF·첨부 업로드·추가 정보 대기·해결/재개·실시간 갱신·계정 전환·권한 취소·없는 문의·일반/비로그인 화면을 확인했다. HTTP와 WebSocket 전송 계층은 시험용이며 실제 운영 인프라 검증은 아니다.
- 실제 컴포넌트 캡처: `build/operator-inbox/operator-inbox-desktop.png`, `operator-inbox-mobile.png`. 답변 후 화면은 `operator-inbox-with-reply-desktop.png`, `operator-inbox-with-reply-mobile.png`. 화면 폭 1440px·390px에서 가로 넘침이 없음을 확인했다. 공통 헤더는 시험용이며 문의함 본문은 실제 제품 코드다.
- 1440px PC·390px 모바일 각각 세 화면을 렌더링했다. 실제 CSS 뷰포트, 가로 넘침 없음, 상태 필터, 문의 선택 후 대화 화면 진입을 확인했다. 생성 이미지를 직접 확인했다.
- `build/operator-inbox-previews/cards-1440.png`: 카드형. 기존 문의 스타일과 가장 가까우며 모바일에서는 한 열로 배치한다.
- `build/operator-inbox-previews/table-1440.png`: 표형. 제목·상태·접수 시각을 빠르게 비교하며 모바일에서는 보조 열을 줄인다.
- `build/operator-inbox-previews/split-1440.png`: 분할형. 목록과 대화·답변을 함께 보고 모바일에서는 위아래로 배치한다.
- 각 모바일 파일명은 `cards-390.png`, `table-390.png`, `split-390.png`다. 모두 가짜 문의를 사용하는 실제 React 렌더링이며 운영 데이터는 변경하지 않는다.

## 8. 아직 확인할 사항

- 운영 배포 전이므로 현재 서비스 화면은 아직 바뀌지 않았다. 배포 후 운영 계정으로 목록·답변·첨부를 확인하고 일반 계정 차단을 확인해야 한다.
- 과거 카드형·표형·분할형 비교 도구는 참고용이다. 실제 운영 문의 화면에는 선택한 분할형을 적용했다.
- 이 작업에서 운영 DB·S3 정책·컨테이너를 변경하지 않았다. 커밋·푸시도 별도 요청 전에는 진행하지 않는다.
