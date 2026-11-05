# 실시간 상태 갱신과 오픈 전 본인 쪽지 확인

작성일: 2026-11-05. 작업 대상: `C:\Users\whdgu\Desktop\graduation`. 운영 배포 결과가 아닌 로컬 구현·검증 기록이다.

## 1. 바뀌는 사용자 경험

| 화면 | 기존 동작 | 변경한 동작 |
| --- | --- | --- |
| 로그인 문의·운영 문의함 | 다른 화면의 답변·해결·재문의를 수동 새로고침으로 확인 | 목록·상세·대화·완료된 첨부를 자동 재조회. 작성 중인 글과 선택 파일은 보존 |
| 비로그인 문의 | 같은 브라우저의 임시 접수 권한으로 REST 조회 | 기존 수동 확인 유지. 개인 상태 채널을 구독하지 않음 |
| 저금통 상세 | 설정을 바꾼 화면만 재조회 | 다른 멤버의 설정 변경도 반영. 작성 중인 설정 폼은 보존 |
| 강퇴·탈퇴·저금통 삭제 | 이미 사라진 참여 권한 때문에 종료 이벤트까지 막힐 수 있음 | 본인 채널로 종료 신호를 받고 목록으로 이동. 없어진 권한을 복원하지 않음 |
| 내 저금통 목록 | 다른 화면의 참여·역할·열림·설정·삭제 반영이 늦음 | 현재 페이지를 자동 재조회. 마지막 페이지가 비면 남은 마지막 페이지로 이동 |
| 초대 관리 | 다른 관리자가 생성·폐기한 코드는 수동 확인 | 현재 OWNER·ADMIN에게만 재조회 신호. 초대코드는 신호에 넣지 않음 |
| 연결 복구·탭 복귀 | 구독만 복구되면 놓친 변경이 남을 수 있음 | 필요한 상세·멤버·초대·열린 쪽지 목록/댓글/리액션·추억 뽑기를 서버 기준으로 다시 맞춤 |
| 오픈 전 쪽지 | 기존 API가 잠금 수준별 마스킹 행과 전체 개수를 반환 | 본인 기록만 목록·검색·상세로 확인. 다른 멤버의 작성 여부·번호·장수를 공개하지 않음 |

새 쪽지 작성 완료 이벤트와 도착 알림은 추가하지 않았다. 잠긴 저금통의 공용 목록은 화면에서 자동 조회하지 않는다. ‘내가 넣은 쪽지’ 버튼을 열 때만 본인 목록을 읽는다. 저장 후 다음에 다시 열면 본인의 최신 기록을 확인할 수 있다.

## 2. 쪽지 공개 규칙

오픈 전에는 활성 멤버인 작성자가 자신의 제목·본문·날짜·장소·태그·사진/영상을 읽기 전용으로 확인할 수 있다. 다른 사람의 상세 번호는 없는 번호와 같은 404로 응답한다. 탈퇴·강퇴 후에는 본인 쪽지도 해당 저금통 API로 읽을 수 없다.

- `GET /api/v1/jars/{jarId}/notes/mine`: 본인 전용. 기본 10개씩, 최대 100개, `page`·`size`·선택 `q`·`tag` 지원.
- 기존 `GET .../notes`: 오픈 전에는 본인 목록만 반환한다. 검색과 전체 개수에도 같은 작성자 조건을 적용한다.
- 기존 `GET .../notes/{noteId}`: 오픈 전 본인 상세, 오픈 후 기존 멤버 상세 조회.
- DTO 구조는 유지한다. 오픈 전 본인 응답의 댓글 개수는 0, 리액션 목록은 빈 배열, 내 리액션은 null이다. 댓글·리액션 API는 기존 오픈 전 제한을 유지한다.

`HIDDEN`·`META_ONLY`·`TITLE_ONLY` 값은 기존 저장 데이터와 요청 호환을 위해 유지한다. 현재 규칙에서는 셋 모두 타인 비공개다. 만들기의 ‘제목만 공개’ 등 실제 정책과 맞지 않는 선택은 고정 안내로 바꿨다. 기존 클라이언트가 오픈 전 마스킹 행·전체 장수에 의존했다면 새 정책에 맞춰야 한다. 새 프론트와 백엔드를 함께 배포해야 한다.

작성자 번호는 요청값을 신뢰하지 않고 서버의 로그인 정보에서 가져온다. SQL에서 저금통·작성자·삭제 여부를 제한하고 목록과 개수를 함께 조회한다. V57에 같은 조건의 복합 인덱스를 추가했다. 첨부는 페이지의 쪽지 번호를 모아 한 번에 조회한다. 쪽지마다 별도 쿼리를 실행하지 않는다.

## 3. 실시간 신호와 보안

기존 로그인용 STOMP(웹소켓 메시지의 구독·전송 규칙) 연결 한 개를 재사용한다. 새 연결이나 라이브러리는 추가하지 않았다.

구독 주소: `/topic/users/{userId}/state`. 로그인한 본인의 번호만 구독할 수 있다. 배달 직전에도 로그인 유효성과 주소 권한을 다시 검사한다.

```json
{"type":"SUPPORT_CHANGED","jarId":null,"inquiryId":123}
```

| type | 재조회 대상 | 수신자 |
| --- | --- | --- |
| `SUPPORT_CHANGED` | 해당 문의와 관련 목록 | 로그인한 작성자·설정된 운영자. 게스트 채널 없음 |
| `JAR_CHANGED` | 설정·상세·목록 | 현재 활성 멤버 |
| `JAR_LIST_CHANGED` | 참여·역할·열림·생성 관련 목록 | 현재 활성 멤버 또는 생성자/변경 대상 |
| `JAR_ACCESS_REVOKED` | 상세 종료·목록 갱신 | 탈퇴·강퇴 당사자, 삭제 직전 참여자 |
| `INVITES_CHANGED` | 초대 관리 목록 | 현재 활성 OWNER·ADMIN |

신호에는 문의 본문·쪽지 작성 정보·사진 주소·초대코드·개인정보를 넣지 않는다. 실제 데이터는 기존 REST API를 다시 호출해 권한을 재검사한다. DB 저장이 커밋(최종 확정)된 뒤에만 보낸다. 롤백하면 보내지 않으며 전송 실패가 이미 성공한 저장을 실패 응답으로 바꾸지 않도록 기존 BestEffortDelivery를 사용한다.

로그인 자체가 만료·무효가 됐으면 연결을 닫는다. 로그인은 유효하고 특정 저금통의 참여 권한만 사라진 경우에는 그 저금통의 메시지만 차단한다. 이렇게 해야 본인 종료 신호와 다른 저금통의 연결까지 끊기지 않는다. 재구독 요청에서도 기존 권한 검사를 유지한다.

짧은 시간에 몰린 신호는 150ms 동안 합친다. 저금통 상세 재조회가 실행 중이면 다음 변경을 합쳐 이후 한 번 더 읽는다. 문의 화면에서 새 조회가 시작되면 이전 조회를 취소하고 최신 응답만 반영한다. 화면 이동·계정 변경 시 예약과 늦은 응답을 무효화한다. 이미 연결된 상태로 화면을 열 때, 연결이 복구될 때, 탭으로 돌아올 때도 최신 상태를 맞춘다. 주기적 전체 폴링은 추가하지 않았다.

## 4. 검증 기록

아래는 2026-11-05 실제 실행 결과다. 테스트 데이터·이미지는 합성이며 실제 메일·S3·AI와 운영 DB는 사용하지 않았다.

| 검사 | 범위와 결과 |
| --- | --- |
| 관련 백엔드 단위·MariaDB 통합 검사 | 152건 통과, 실패·스킵 0. 쪽지 공개 정책, 조회 범위, 권한, 커밋/롤백, 전송 실패 격리, 문의 동시성·게스트·첨부 등 |
| 실제 HTTP·STOMP·MariaDB 격리 시험 | 6건 통과. 작성자 읽기, 타인 검색/장수 0·상세 404, 새 쪽지 무통지, 문의 신호, 강퇴 후 403·본인 종료 수신, 타인 개인 채널 거부, 실제 설정 수정·초대 폐기·저금통 삭제 신호 |
| 프론트 로직 검사 | 기존 `node --test src/**/*.test.mjs` 268건 통과 |
| 새 Chrome PC·모바일 시험 | 1280px·390px에서 12시나리오 통과. 본인 목록/상세/첨부·검색·페이지·빈 상태·오류 재시도·늦은 응답, 문의 작성 글/첨부 보존·해결/재문의, 운영 목록/상세, 게스트 제외, 설정 초안 보존, 초대/목록/강퇴, 연결 복구·탭 복귀 |
| 기존 Chrome 회귀 검사 | 문의 확장 18시나리오·편지 디자인 3시나리오 통과. 기존 쪽지 작성의 장소 선택·취소·검색·저장 관련 8항목도 통과 |
| 빌드 | 백엔드 `bootJar`, 프론트 `npm run build` 통과. 프론트의 기존 500kB 초과 청크 경고는 남아 있음 |
| 300계정 문의 시험 | 통계 대상 3,301요청 모두 200, 최대 진행 중 300. 문의 중복 방지·대화·해결·재개·권한을 검사. 별도 비로그인 보안 요청은 예상 거부 응답도 검사 |
| 300개 신호 집중 시험 | 브라우저 한 화면의 연속 300개 변경을 합쳐 재조회하는지 검사. 300개의 실제 웹소켓 연결 시험과는 다름 |

최종 HTTP·STOMP 시험: `build/isolated-e2e-results/memoryjar-e2e-8c310c987f46/summary.txt`.
300계정 시험: `build/isolated-e2e-results/memoryjar-e2e-ef3bef639229/support-300.json`.
두 실행 모두 외부 기본 경로가 없는 Docker 내부 네트워크와 임시 MariaDB를 사용하고 종료 후 실행 컨테이너·네트워크를 정리했다.

브라우저 화면 캡처는 `build/realtime-own-notes/own-notes-1280.png`, `own-notes-390.png`에 보관했다. 시험용 합성 이미지이며 제품 이미지가 아니다. 로컬 `build` 결과와 `frontend/dist`, 루트의 기존 미추적 `node_modules`·`package.json`·`package-lock.json`은 제품 소스 변경에 포함하지 않는다.

300계정 결과는 문의 API 기능·동시성 시험이며, 운영 서버의 전체 수용량·실제 S3 업로드·로그인·WebGL·300개 소켓의 처리량을 보장하지 않는다. 개발 PC에서 생성기와 서버가 같은 2 CPU·1536MB 컨테이너를 공유했다.

## 5. 배포 시 확인할 점

구현·로컬 검증을 마친 변경을 커밋·푸시 대상으로 준비했다. 이 문서는 운영 배포 성공 기록이 아니다. V57과 새 API가 있는 백엔드를 먼저 적용하고 새 프론트를 적용한다. 운영에서는 두 로그인 계정과 운영자 화면으로 문의 갱신·권한 종료·본인 기록을 확인해야 한다. 비로그인 문의는 수동 확인을 유지한다.

백엔드의 SimpleBroker(현재 실행 서버 안에서 구독을 관리하는 도구)는 기존 단일 서버 구조를 유지한다. 서버를 여러 대로 늘릴 경우 서버 간 메시지 전달 구조는 별도 검증이 필요하다. 실시간 신호는 전달 보장 저장소가 아니므로 네트워크 중단 중 변경은 재연결·탭 복귀 시 REST 조회로 복구한다.

## 6. 변경 파일 목록

핵심 처리는 `UserStateRealtimeService`, `NoteService`·`NoteRepository`, `useUserStateRefresh`, `OwnNotesModal`에 있다. 아래 목록은 이번 작업의 소스·테스트·문서 경로이며 빌드·의존성 산출물은 제외했다.

- `docs/API.md`
- `docs/DTO.md`
- `docs/PROJECT_OVERVIEW.md`
- `docs/REALTIME_OWN_NOTES_2026-11-05.md`
- `frontend/src/api/ownNoteApi.js`
- `frontend/src/api/userStateSocketApi.js`
- `frontend/src/features/jarDesign/components/JarDesignFinalizePanel.jsx`
- `frontend/src/features/jarDetail/components/OwnNotesModal.jsx`
- `frontend/src/features/jarDetail/hooks/useJarRealtimeEvents.js`
- `frontend/src/features/support/SupportInquiryDetail.jsx`
- `frontend/src/pages/JarDetailPage.jsx`
- `frontend/src/pages/JarsPage.jsx`
- `frontend/src/pages/NoteSection.jsx`
- `frontend/src/pages/SupportInquiriesPage.jsx`
- `frontend/src/realtime/useUserStateRefresh.js`
- `frontend/tests/support-preview.jsx`
- `frontend/tests/user-state-preview.html`
- `frontend/tests/user-state-preview.jsx`
- `frontend/tests/user-state.browser.cjs`
- `src/main/java/shop/esjh/memoryjar/config/WebSocketAuthChannelInterceptor.java`
- `src/main/java/shop/esjh/memoryjar/config/WebSocketDeliveryAuthorizationInterceptor.java`
- `src/main/java/shop/esjh/memoryjar/controller/note/NoteController.java`
- `src/main/java/shop/esjh/memoryjar/repository/jar/JarMemberRepository.java`
- `src/main/java/shop/esjh/memoryjar/repository/note/NoteRepository.java`
- `src/main/java/shop/esjh/memoryjar/service/UserStateRealtimeService.java`
- `src/main/java/shop/esjh/memoryjar/service/jar/JarMemberRealtimeService.java`
- `src/main/java/shop/esjh/memoryjar/service/jar/JarOpenRealtimeService.java`
- `src/main/java/shop/esjh/memoryjar/service/jar/JarService.java`
- `src/main/java/shop/esjh/memoryjar/service/note/NoteService.java`
- `src/main/java/shop/esjh/memoryjar/service/support/SupportAttachmentPersistenceService.java`
- `src/main/java/shop/esjh/memoryjar/service/support/SupportConversationService.java`
- `src/main/java/shop/esjh/memoryjar/service/support/SupportInquiryPersistenceService.java`
- `src/main/resources/db/migration/V57__index_own_notes.sql`
- `src/test/java/shop/esjh/memoryjar/config/WebSocketAuthChannelInterceptorTest.java`
- `src/test/java/shop/esjh/memoryjar/config/WebSocketDeliveryAuthorizationInterceptorTest.java`
- `src/test/java/shop/esjh/memoryjar/isolated/IsolatedE2eLauncher.java`
- `src/test/java/shop/esjh/memoryjar/isolated/IsolatedHttpWebSocketTest.java`
- `src/test/java/shop/esjh/memoryjar/repository/jar/JarMemberRepositoryTest.java`
- `src/test/java/shop/esjh/memoryjar/repository/note/NoteRepositoryTest.java`
- `src/test/java/shop/esjh/memoryjar/service/RealtimeDeliveryFailureTest.java`
- `src/test/java/shop/esjh/memoryjar/service/UserStateRealtimeServiceTest.java`
- `src/test/java/shop/esjh/memoryjar/service/jar/JarServiceTest.java`
- `src/test/java/shop/esjh/memoryjar/service/note/NoteServiceTest.java`
- `src/test/java/shop/esjh/memoryjar/service/support/SupportExpansionIntegrationTest.java`
- `src/test/java/shop/esjh/memoryjar/service/support/SupportInquiryIntegrationTest.java`
- `src/test/java/shop/esjh/memoryjar/service/support/SupportSafetyTest.java`
