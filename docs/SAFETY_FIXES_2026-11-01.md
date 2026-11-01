# 추가 오류 수정과 검증 — 2026-11-01

> 이 문서는 앞선 9개 항목의 기록이다. 이후 추가한 수정과 새 실행 결과는 [후속 6개 항목](SAFETY_FOLLOWUP_2026-11-01.md)에 구분해 기록한다.

작업 대상은 `C:/Users/whdgu/Desktop/graduation`의 현재 작업 파일이다. 기존 미커밋 변경은 보존했다. 앞선 분석에서 확인한 9개 항목을 수정하는 작업이며, 모든 코드에 오류가 없다는 보증은 아니다. 운영 DB·실제 S3·유료 AI·메일에는 시험 요청을 보내지 않았다.

## 1. 로그인 갱신 직후 로그아웃이 무효가 되는 문제

**기존 동작:** 갱신은 기존 토큰을 폐기하고 새 토큰을 만들었다. 로그아웃은 전달받은 토큰 하나만 폐기했다. 갱신이 먼저 끝나면 새 토큰이 남았고, 늦은 응답으로 브라우저에 다시 저장될 수 있었다.

**변경:** 같은 기기의 로그인에 `session_id`를 부여한다. 토큰을 교체해도 이 값은 유지하고 로그아웃은 해당 묶음 전체를 폐기한다. 갱신·로그아웃·비밀번호 재설정의 잠금 순서는 사용자 → 토큰으로 통일했다. 새 access JWT에도 `loginSessionId`를 넣어 HTTP와 WebSocket 모두 실제 로그인 묶음이 살아 있는지 검사한다. 사용자 버전과 묶음 확인은 SQL 한 번으로 끝낸다. 다른 기기의 로그인은 유지한다.

프론트는 로그인 상태가 바뀐 횟수를 요청에 기록한다. 로그아웃 시작 시 진행 중인 갱신을 취소하고, 이전 상태에서 보낸 요청은 재시도하거나 다음 계정의 화면을 갱신할 수 없다. 취소만으로 쿠키 수신을 완전히 막을 수 있다고 가정하지 않는다. 서버의 로그인 묶음 폐기가 보안 경계다.

**주요 파일:**

- `src/main/java/shop/esjh/memoryjar/{entity/RefreshToken.java,repository/RefreshTokenRepository.java,repository/UserRepository.java,service/RefreshTokenService.java}`
- `src/main/java/shop/esjh/memoryjar/{controller/AuthController.java,auth/OAuth2SuccessHandler.java,jwt/SessionValidityService.java,jwt/JwtAuthenticationFilter.java,config/WebSocketDeliveryAuthorizationInterceptor.java}`
- `frontend/src/api/apiClient.js`, `frontend/src/App.jsx`
- `src/main/resources/db/migration/V54__track_refresh_login_sessions.sql`

**호환 범위:** REST 응답과 쿠키 이름·CSRF·CORS는 유지했다. ID가 없는 기존 access JWT는 만료까지 기존 사용자 버전 검사로 호환한다. 기기 단위 즉시 폐기는 새 로그인 또는 새 코드에서 갱신한 JWT부터 적용된다. 과거 토큰의 잃어버린 회전 관계를 복원했다고 주장하지 않는다.

## 2. 댓글 수정과 삭제가 겹쳐 삭제된 댓글이 살아날 수 있는 문제

**기존 동작:** 생성·삭제는 부모 쪽지를 잠갔지만 수정은 잠그지 않았다. 수정 요청이 예전 행을 저장하면 삭제 상태를 덮을 가능성이 있었다.

**변경:** 수정도 같은 부모 쪽지 잠금을 먼저 얻는다. 수정·삭제 모두 `READ_COMMITTED`(잠금 대기 후 확정된 최신 데이터를 읽는 방식)로 처리한다. 수정이 먼저면 삭제가 기다렸다가 삭제하고, 삭제가 먼저면 수정은 404로 끝난다. 작성자·멤버 권한과 실시간 이벤트는 유지했다.

**파일:** `src/main/java/shop/esjh/memoryjar/service/note/NoteCommentService.java`

## 3. 늦은 응답이 다른 저금통·쪽지 화면을 덮는 문제

**기존 동작:** A를 조회한 다음 B를 열어도 A의 늦은 성공·오류·로딩 종료가 B 화면에 반영될 수 있었다. 보이는 내용과 리액션 대상 ID가 달라질 위험도 있었다.

**변경:** 화면 범위와 요청 종류별로 마지막 요청만 결과를 반영한다. 성공뿐 아니라 오류·로딩 종료도 같은 검사를 거친다. 상세 모달을 닫으면 이전 상세 요청을 무효화한다. 실제 확대 화면의 쪽지 상세 경로에도 적용했다. 계정·저금통이 바뀌면 상세 페이지 인스턴스를 새로 만들어 이전 폼·모달 상태를 넘기지 않는다.

**파일:**

- `frontend/src/api/{requestGate.mjs,useRequestGate.js}`
- `frontend/src/features/jarDetail/hooks/{useJarDetail.js,useJarMembers.js,useJarInvites.js}`
- `frontend/src/pages/{NoteSection.jsx,JarDetailPage.jsx}`, `frontend/src/App.jsx`

화면에서 더 이상 필요 없는 응답을 적용하지 않는 처리다. 모든 조회 HTTP 자체를 취소하거나 서버 쿼리 수를 줄였다는 의미는 아니다.

## 4. 이전 계정의 알림 응답이 새 계정에 나타나는 문제

**변경:** 알림 목록·개수·읽음 처리·구독 콜백은 현재 계정의 요청인지 검사한다. 계정 변경 직후 이전 목록·배지·로딩 상태를 비운다. 이전 계정 응답이 늦게 와도 새 계정의 알림이나 이동 대상을 바꾸지 못한다.

**파일:** `frontend/src/App.jsx`, 위 공통 요청 검사 파일

## 5. 첨부 목록 안의 null이 500을 만드는 문제

**기존 동작:** 첨부 목록 자체는 선택이지만 `[null]`도 검증을 통과해 서비스에서 오류가 났다.

**변경:** 목록 내부 항목에 `@NotNull`을 적용해 HTTP 요청 단계에서 400으로 거절한다. 서비스를 직접 호출해도 null 항목을 방어한다. 첨부 생략·빈 목록·기존 최대 10개 정책은 유지한다.

**파일:** `dto/note/request/NoteCreateRequest.java`, `service/note/NoteAttachmentService.java` — 모두 `src/main/java/shop/esjh/memoryjar/` 아래

## 6. 깊은 댓글의 기존 전체 조회가 JSON 출력 중 실패하는 문제

**기존 동작:** 트리를 Java에서 반복문으로 만들더라도 JSON 출력에는 중첩 제한이 있었다. 끝없이 깊은 DTO 응답은 실패할 수 있었고 전체 조회량에도 상한이 없었다.

**변경:** 호환용 전체 조회는 DB에서 최대 1,001개만 읽고, 댓글 1,000개 또는 깊이 100단계를 넘으면 출력 시작 전에 400과 `/comments/page` 안내를 반환한다. 정상 크기의 트리 응답은 그대로다. 깊은 답글의 저장·삭제를 금지하거나 자르지 않는다. 현재 프론트의 평면 페이지 조회는 유지한다.

**파일:** `repository/note/NoteCommentRepository.java`, `service/note/NoteCommentService.java` — 모두 Java 소스 루트 아래

검증에는 100단계 응답의 실제 JSON 직렬화, 101단계 거절, 1,100단계 댓글의 페이지 조회·일괄 삭제가 포함된다.

## 7. 이미 종료된 AI 대기 작업이 외부 호출을 시작하는 문제

**변경:** 원본 읽기 전, AI 생성 전, 콘텐츠 심사 전, 후보 업로드 예약 전에 PROCESSING·Draft 활성 상태·접수 기준 제한 시간을 다시 확인한다. 큐에서 기다린 시간도 기존 600초 기본 제한에 포함한다. 오래됐거나 종료된 작업은 다음 외부 단계를 시작하지 않는다. 네트워크 I/O 중 DB 잠금을 유지하지 않는다.

**파일:** `service/ai/JarAiGenerationService.java`, `service/ai/JarAiGenerationPersistenceService.java` — Java 소스 루트 아래

이미 제공자에게 전송해 실행 중인 요청을 소급 취소하거나 과금이 없다고 보장하는 처리는 아니다. 기존 후보 보호·실패 정리·제한 실행기·화면의 안전 재조회는 유지한다.

## 8. 취소·삭제 실패 뒤 임시 업로드가 남는 문제

**기존 동작:** 완료 후 `.pending` 삭제 실패는 로그만 남았고, 사용자가 첨부를 취소하면 미완료 임시 객체도 남을 수 있었다.

**변경:** 업로드 기록에 정리 예정·완료 시각을 저장한다. 새 업로드는 실제 URL 만료 + 10분 유예 뒤 정리할 수 있다. 오래된 기록은 과거 서명 만료를 알 수 없으므로 생성 후 8일로 보수적으로 보충한다. PRESIGNED만 EXPIRED로 닫고, COMPLETED·CONSUMED 상태와 최종 파일은 보존한다.

한 실행에서 최대 50개를 읽고, 짧은 DB 잠금으로 5분 뒤 재시도를 예약한 후 잠금 밖에서 `.pending`만 삭제한다. 삭제 성공만 완료로 기록하므로 실패·재시작 후에도 다시 시도할 수 있다. 일반 업로드 정리는 별도 스케줄러에서 실행해 AI 정리와 자동 오픈을 막지 않는다. 기존의 빠른 완료 후 삭제도 유지하며, 서명 유효 기간 중 재업로드된 임시 객체는 만료 후 스케줄러가 다시 정리한다.

**파일:**

- `entity/file/FileUpload.java`, `enums/file/FileUploadStatus.java`, `repository/file/FileUploadRepository.java`
- `service/file/{FileService.java,FileUploadTransactionService.java,FileStagingCleanupPersistenceService.java,FileStagingCleanupScheduler.java}`
- `config/SchedulerConfig.java`
- `src/main/resources/db/migration/V55__track_upload_staging_cleanup.sql`

Java 경로는 모두 `src/main/java/shop/esjh/memoryjar/` 기준이다. 완료 파일의 사용 여부를 추측해 지우는 기능은 추가하지 않았다.

## 9. 이미지 캐시가 꽉 찼을 때 S3 동시 읽기가 늘어나는 문제

**기존 동작:** 8개 제한은 진행 중 요청을 저장하는 맵에만 적용됐다. 맵 밖의 직접 읽기는 계속 늘어날 수 있었다.

**변경:** 맵이 꽉 차면 추적 없는 읽기로 우회하지 않고 503을 반환한다. 캐시를 껐거나 종료 중인 직접 읽기에도 세마포어(외부 읽기 허가를 정해진 수만 나누는 장치)를 적용한다. 실제 동시 S3 읽기는 서버 인스턴스당 최대 8개다. 캐시 적중과 같은 키의 대기는 추가 읽기 허가가 필요 없다. 오류가 나도 허가는 반납한다. 권한 검사는 캐시를 읽기 전에 계속 수행한다.

**파일:** `src/main/java/shop/esjh/memoryjar/service/jar/JarDesignTextureCache.java`

## 검증과 적용 경계

실행 결과는 이 문서 마지막의 검증 결과에 기록한다. 로컬 테스트 통과와 운영 적용은 구분한다.

- 기존 의존성을 사용했다. 새 패키지를 설치하지 않았다.
- DB 시험은 Testcontainers의 일회용 MariaDB에서 실행했다. 실제 계정·운영 DB를 사용하지 않았다.
- 브라우저는 가짜 API 응답을 주입해 응답 역전과 오류를 재현했다. 외부 API·앱 WebSocket 연결은 차단하고 Vite의 로컬 개발 연결만 허용했다.
- V54·V55는 새 마이그레이션이다. 이미 적용된 이전 파일은 수정하지 않았다.
- 운영 반영 때는 DB 호환 백엔드를 먼저 적용해야 한다. `EXPIRED`를 모르는 옛 백엔드로의 단순 롤백은 별도 호환 검토가 필요하다.
- 커밋·푸시·배포, 운영 인증·S3 삭제 권한·스케줄러 실행 확인은 이 작업에서 수행하지 않았다.

## 검증 결과

| 검사 | 결과 | 확인 범위 |
| --- | --- | --- |
| 전체 백엔드 `test` | 161개 테스트 클래스, 총 2,013개 중 2,008개 통과·실패/오류 0·조건부 제외 5 | 기존 기능과 신규 회귀, V53 → V55 실제 업그레이드 포함 |
| 최종 캐시 보강 재시험 | 15개 통과·실패 0 | 캐시 켬/끔 모두 동시 읽기 8개, 상한 초과·동일 키 병합·오류 후 반납·만료·종료 |
| 별도 격리 HTTP·WebSocket | 4개 통과·실패 0 | 가입·로그인·HTTP 보안, 인증 오류·제공자 실패, 내부 모니터링, 채팅·재연결·외부인 거절 |
| 프론트 Node 테스트 | 262개 통과·실패 0 | 기존 3D 모양 보존과 새 요청 순서 검사 포함 |
| 실제 Chrome 자동 시험 | 4개 시나리오 통과 | 저금통 A→B 역전, 같은 화면의 요청 역전, 동시 401 병합·로그아웃·세션 만료 단일 통지, PC/모바일의 실제 App 알림 계정 전환 |
| `npm run build` | 통과 | 기존 대형 청크 경고는 남음 |
| `bootJar`, `jar` | 통과 | 두 최종 파일 모두 `application-local`·`.env` 항목 0개 |
| `git diff --check` | 통과 | 공백 오류 없음 |

전체 백엔드 시험 후, 캐시 맵이 꽉 찬 짧은 순간에도 추적 없는 읽기를 허용하지 않도록 추가로 보강했다. 해당 클래스의 15개 시험과 두 서버 패키징을 다시 수행했다. 전체 2,013개와 재시험 15개는 중복을 포함하므로 합쳐서 고유 테스트 개수라고 발표하지 않는다.

일반 실행에서 제외된 항목은 격리 전용 HTTP·WebSocket 4개와 별도 읽기 부하 시나리오 1개다. 앞의 4개는 전용 Docker 내부 네트워크에서 별도로 통과했다. 별도 읽기 부하 시험 1개는 이번 오류 수정 검증에서 재실행하지 않았다.

격리 실행 ID는 `memoryjar-e2e-14edefff0b15`다. `build/isolated-e2e-results/memoryjar-e2e-14edefff0b15/summary.txt`에서 4개 성공·실패 0을 확인했다. 이 실행의 컨테이너·네트워크가 남지 않은 것을 확인하고, 시험용 Vite 서버도 종료했다. 기존 로컬 앱이나 운영 서버는 종료하지 않았다.

결과 요약은 로컬 `build/safety-fixes-2026-11-01/`에 보관한다. 원본 테스트 로그를 공개 문서나 Git에 포함하지 않는다.
