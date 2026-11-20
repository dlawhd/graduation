# 도움말·사용자 문의 화면 적용

기준 프로젝트: `C:/Users/whdgu/Desktop/graduation`. 사용자가 선택한 4개 화면 예시를 제품 코드에 적용했다. 공통 헤더와 운영 문의함 배치는 유지한다. 이 작업에서 운영 배포·실제 문의 접수·운영 DB 변경은 하지 않았다.

## 1. 수정한 파일

| 경로 | 역할 |
| --- | --- |
| `frontend/src/features/support/SupportCenterLayout.jsx`, `supportCenter.css` | 사용자 도움말·문의 제목, 공통 메뉴, PC/모바일 배치 |
| `frontend/src/features/support/SupportGuidance.jsx` | 일반 작성 안내와 로그인 문의의 브라우저 조회 안내 |
| `frontend/src/features/support/SupportInquiryList.jsx` | 본인/게스트 목록과 필요한 경우에만 보이는 페이지 이동 |
| `frontend/src/features/support/useSupportInquiryList.js` | 커서 조회, 늦은 응답 차단, 오류·재시도, 로그인 사용자의 실시간 갱신 |
| `frontend/src/features/support/supportCenter.mjs`, `supportCenter.test.mjs` | 메뉴의 안전한 문맥 전달, FAQ 검색, 문의 번호, 첨부 재시도 검증 |
| `frontend/src/pages/SupportHelpPage.jsx` | 서버 FAQ 검색·주제 선택·빈 결과/오류·인증 상태별 문의 연결 |
| `frontend/src/pages/SupportInquiriesPage.jsx` | 상태 중심 본인 목록, 문의 없음, 답변 상세 |
| `frontend/src/pages/SupportNewPage.jsx` | 작성·보조 안내 배치, 로그인 후 복귀 유지 |
| `frontend/src/pages/SupportLoginHelpPage.jsx` | 작성/브라우저 내역 탭, 쿠키 확인, 문의 조회·페이지 이동 |
| `frontend/src/features/support/SupportComposer.jsx` | 탭 전환 중 글·파일 유지, 작업 중 중복 차단, 새로고침 확인, 첨부 재시도 |
| `frontend/src/features/support/SupportInquiryDetail.jsx` | 같은 상세 응답을 외부 상태 표시에 재사용, 권한 오류 시 요약 제거, 첨부 재시도 |
| `frontend/src/features/support/supportView.mjs` | 확정 실패와 불확실한 첨부 결과 구분 |
| `frontend/src/App.jsx` | 도움말에 기존 계정 정보 전달. 추가 `/me` 조회 없음 |
| `src/main/java/shop/esjh/memoryjar/service/support/SupportAttachmentPersistenceService.java` | 완료 재전송 복구와 확정 실패/진행 중 응답 구분 |
| `src/test/java/shop/esjh/memoryjar/service/support/SupportExpansionIntegrationTest.java` | 저장 응답 유실 재시도·확정 실패·진행 중 검증 |
| `tools/ui/support-center.browser.mjs`, `isolated-support-browser.mjs` | 실제 페이지·API 계층을 격리 브라우저와 로컬 대역 서버에서 검증 |

## 2. 기존 동작

도움말의 FAQ가 큰 카드로 반복됐고, 문의 화면마다 제목·메뉴·여백 배치가 달랐다. 로그인 도움의 작성과 브라우저 내역은 긴 한 화면에 이어졌고, 문의가 없어도 페이지 버튼이 나왔다. 일반 문의와 로그인 문의는 각각 계정 인증과 문의 전용 쿠키를 사용했다.

첨부 오류에서 409를 제외한 응답은 새 요청 번호로 바꿨다. 이미 첨부가 저장됐지만 응답만 끊긴 경우 새 번호로 다시 저장할 수 있었다.

## 3. 변경한 동작

- **도움말:** 검색·주제 선택·FAQ 행 목록·문의 안내로 구성한다. 검색과 주제는 URL에 반영하고, 입력으로 API를 반복 호출하지 않는다. 검색 조건 초기화와 조회 오류 재시도를 제공한다. ‘기타’는 마지막에 둔다.
- **내 문의:** 제목·상태·유형·접수일을 한 목록에 표시한다. 빈 문의함은 작성으로 안내하고, 한 페이지뿐이면 페이지 버튼을 숨긴다. 기존 12건 커서를 사용하며 새 전역 통계나 지원되지 않는 서버 상태 필터를 만들지 않았다.
- **작성:** PC는 입력과 안내를 나란히, 모바일은 한 열로 배치한다. 기존 제목 100자·내용 1,000자, 첨부 최대 3개/각 2MB, 공유 동의, 보관 안내, 문맥 제외 기능을 유지한다. 로그인 안내는 검증된 복귀 경로를 전달한다.
- **로그인 문제 문의:** 작성/이 브라우저의 문의를 나누고 URL로 상세 링크와 뒤로 가기를 유지한다. 탭 전환만으로 작성 폼을 해제하지 않아 글·선택 파일·동일 요청 번호가 유지된다. 완료 시 폼을 비우고, 내역의 첫 페이지로 돌아간다. 문의 쿠키가 없거나 만료되면 과거 내역을 숨긴다.
- **답변:** 기존 본문·대화·원본·첨부·추가 설명·해결/재문의 API를 재사용한다. 옆의 상태 안내도 같은 상세 응답을 사용한다. 권한 오류·없는 문의에서는 이전 요약을 제거한다.
- **작성 보호:** 미전송 글이나 첨부가 있으면 새로고침/창 종료 시 브라우저 확인을 요청한다. 페이지 내 탭 전환 보존을 지원하며, 다른 SPA 화면으로 이동했다 돌아오는 영구 초안 기능은 아니다. localStorage/sessionStorage에 문의 본문이나 파일을 기록하지 않는다.

## 4. 변경 이유

선택한 예시의 크림색·흰 카드·진한 초록색을 실제 화면에 맞추고, 큰 카드와 이동 버튼의 반복을 줄이기 위함이다. 기존에 정상 동작하는 접수·답변·첨부·권한 처리를 재사용하면서 탭 이동, 실패 복구, 늦은 응답의 예외를 보완했다.

## 5. 성능·보안·호환성

- 로그인 사용자의 목록·상세는 기존 공유 WebSocket을 통해 재조회한다. **비로그인 문의는 WebSocket을 구독하지 않는다.** 브라우저 내역은 쿠키 권한 확인 후 명시적으로 조회한다.
- 이전 요청은 AbortController와 요청 번호/화면 범위로 무효화한다. 계정 변경 시 이전 목록을 재사용하지 않는다. 페이지 버튼의 연속 클릭을 막는다.
- 탭 사이에 문제 화면 정보를 전달할 때 기존 허용 목록의 경로·식별자·오류 분류만 사용한다. 검색어·문의 번호·외부 경로를 새 문의 문맥에 섞지 않는다.
- 서버 권한·CSRF·게스트 쿠키·업로드 내용 검사·보관 기간을 유지한다. 새 라이브러리나 DB 마이그레이션은 없다.
- **첨부 재시도:** 동일 번호의 `READY` 결과는 기존 첨부를 반환한다. 결과가 불명확한 연결 오류/5xx와 처리 중 409에서는 번호를 유지한다. 서버가 기존 `FAILED` 상태를 확인하면 **422**를 반환하고, 클라이언트가 다음 시도를 새 번호로 준비한다. 일반·게스트·운영 답변에 같은 정책을 적용했다.
- API 주소와 문의/첨부 DTO는 변경하지 않았다. 확정 실패의 422 계약을 위해 프론트와 백엔드를 함께 반영해야 한다. 이전 클라이언트도 422에서 새 번호로 재시도하므로 동작 호환성을 유지한다.

## 6. 실행한 검증

```powershell
# 저장소 루트
.\gradlew.bat --offline test --tests '*Support*Test' --tests '*SecurityConfigTest' bootJar --console=plain
node tools/ui/support-center.browser.mjs
node tools/ui/operator-inbox.browser.mjs
npm.cmd --prefix frontend run build -- --outDir ../build/support-center/frontend

# frontend 디렉터리
$tests = @(rg --files src -g '*.test.mjs')
node --test $tests
```

## 7. 결과

- 관련 백엔드 **104건 중 103건 통과·조건부 제외 1건·실패 0**. 백엔드 JAR 빌드 성공. 전체 백엔드 테스트를 실행한 결과는 아니다.
- 프론트 Node 테스트 **356건 통과·실패 0**.
- 사용자 문의 브라우저 **22개 시나리오 통과**: 검색·문맥 전달·폼 검증·파일 동의·중복 접수·접수/첨부 응답 유실·답변/해결/재개·페이지·조회 실패·실시간·계정 변경·비로그인 보호·게스트 쿠키/탭·새 접수 후 첫 페이지 복귀·권한 거부 시 재시도 중단·없는 문의 등을 확인했다.
- 운영 문의함 브라우저 회귀 **21개 시나리오 통과**.
- 최종 프론트 빌드 성공. 기존 큰 청크 경고는 남아 있다.
- 1440px PC·390px 모바일의 실제 컴포넌트를 캡처하고 입력 폭·가로 넘침·문구와 배치를 확인했다. 캡처의 공통 헤더와 데이터는 시험용이고 본문은 제품 코드다. HTTP/소켓 전송 대역 결과는 실제 운영 인프라 검증을 대신하지 않는다.

산출물: `build/support-center/` 아래 `help-desktop.png`, `help-mobile.png`, `new-desktop.png`, `new-mobile.png`, `inquiries-desktop.png`, `inquiries-mobile.png`, `empty-desktop.png`, `login-new-desktop.png`, `login-new-mobile.png`, `login-history-desktop.png`, `login-history-mobile.png`, `browser-results.json`. 운영 회귀 기록은 `build/operator-inbox/browser-results.json`이다.

## 8. 남은 확인과 수동 확인 방법

이번 작업은 커밋·푸시·배포를 실행하지 않았다. 운영 반영 후에는 다음을 실제 계정과 브라우저에서 확인해야 한다.

1. `/help`: 검색·주제·초기화·뒤로 가기, 문의하기로 넘어갈 때 연결한 문제 화면 유지.
2. `/support/new`: 로그인 후 복귀, 문의 접수 후 상세 이동, 사진 없이 접수, 첨부 공유 동의·실패 후 재시도.
3. `/support/inquiries`: 내 문의만 표시, 상태 변경·추가 답변 반영, 목록/상세·페이지 이동.
4. `/support/login-help`: 로그아웃 상태에서 접수, 작성/이 브라우저 내역 전환 시 글·파일 보존, 같은 브라우저의 답변 확인. 다른 브라우저와 쿠키 삭제 후에는 조회 불가 확인.
5. 모바일에서 입력·파일 선택·전송·메뉴·내역이 잘리지 않는지 확인.

이전 단계의 추가 인증 제거와 저금통 그림판 여백 변경은 별도 작업 이력이며 이 문서의 사용자 문의 UI 변경과 구분한다.
