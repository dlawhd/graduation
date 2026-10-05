# 쓰기 동시성·댓글 조회·AI 정리 계약 (2026-10-05)

기존 저금통 생성, 댓글 답글 깊이, 리액션 토글 규칙을 유지하는 증분이다.
이 문서는 로컬 구현 계약과 검증 기록이다. 운영 배포 및 운영 DB 검증 완료를 의미하지 않는다.

## 쪽지 본문

- 신규 `POST /api/v1/jars/{jarId}/notes`의 `content`는 필수이며 최대 300자다.
- DTO·서비스에서 검증하고 초과 요청은 HTTP 400이다. 작성창도 `maxLength=300`과 글자 수를 표시한다.
- 길이는 Java `String.length()`와 JS `String.length`/textarea에 맞춘 UTF-16 단위다.
- 기존 저장 쪽지는 자르거나 변경하지 않는다. 첨부·제목·태그 계약은 유지한다.

## 댓글과 답글

새 화면은 `GET /api/v1/jars/{jarId}/notes/{noteId}/comments/page`를 사용한다.

| 요청 | 계약 |
| --- | --- |
| `cursor` | 기본 0, 0 이상. 이전 응답의 `nextCursor` 사용 |
| `size` | 기본 30, 1~100 |
| `focusId` | 선택. 알림 대상이나 방금 작성한 댓글의 조상 경로를 함께 읽음 |

공통 `{data: ...}` 안에 `items/hasMore/nextCursor/totalCount/flat`을 반환한다.

- `items`는 기존 `NoteCommentItem` 필드와 빈 `replies`를 사용하는 평탄 목록이며 `flat=true`다.
- ID 오름차순, `size+1` 조회로 다음 페이지를 판정한다. 작성자를 함께 읽되 컬렉션 fetch join은 하지 않는다.
- `focusId`가 있으면 ID/부모 ID 관계만 읽고 조상 본문을 최대 100 ID씩 나눠 읽는다. 이 경우 `items`는 size보다 클 수 있다. **커서는 일반 페이지의 마지막 ID**이므로 대상 경로를 덧붙여도 중간 댓글을 건너뛰지 않는다.
- 전체 개수는 `totalCount`다. 현재 읽거나 펼친 댓글 수와 혼동하지 않는다.
- 답글 깊이에 새 제한을 두지 않는다. 트리/경로 조립과 하위 삭제는 반복 처리한다.
- 삭제는 부모 쪽지 잠금 아래에서 하위 ID를 찾고 최대 500 ID 단위로 soft delete한다. 답글 작성도 같은 잠금을 사용한다.
- 기존 `GET .../comments` 트리 응답은 구 클라이언트 호환용으로 남긴다. 이 API의 전체 조회/깊은 중첩 JSON 비용은 그대로 있으므로 새 화면에서는 사용하지 않는다.
- 알림 경로 조회는 모든 관계 ID를 읽고, 깊은 트리를 모두 펼치면 화면 렌더링 비용도 늘어난다. 무제한 답글을 무제한 비용 없는 기능으로 보장하지 않는다.

## 동시 쓰기 잠금

- 리액션 토글과 명시적 삭제는 부모 Note를 먼저 잠그고 최신 리액션을 읽는다. 최초 행이 없어도 공통 잠금 기준이 있으므로 동일 쪽지의 쓰기는 순차 처리된다. 같은 이모지 두 요청은 저장 후 취소라는 기존 규칙을 유지한다.
- 초대 참여와 설정 변경은 같은 Jar 쓰기 잠금을 사용한다. 정원 검사/변경 및 참여 수 반영이 완료될 때까지 유지한다.
- 두 경로는 READ_COMMITTED로 잠금 대기 후 최신 멤버 수를 읽는다.
- 자동 오픈 보정은 REQUIRES_NEW이므로 설정 변경의 외부 Jar 잠금을 잡기 **전** 수행한다. 이후 잠금 안에서 오픈 정책과 상태를 재검사한다.

## V48: 실패 AI 후보 정리

`jar_ai_generations`에 nullable 필드 두 개와 조회 인덱스를 추가한다.

| 컬럼 | 목적 |
| --- | --- |
| `candidate_upload_s3_key VARCHAR(512)` | PUT 전에 짧은 DB 트랜잭션에서 커밋하는 업로드 예약 키 |
| `candidate_cleanup_at DATETIME(6)` | FAILED 예약 파일의 삭제가 실제 성공한 시각 |

1. 심사 완료 → 예약 키 커밋 → DB 트랜잭션 밖에서 S3 PUT → 성공 상태 커밋.
2. 업로드 완료가 확실하고 DB 상태가 FAILED이면 즉시 보상 삭제한다. 삭제 실패/DB 완료 기록 실패 시 키는 남아 재시도된다.
3. PUT 응답 유실처럼 완료 여부가 모호하면 즉시 삭제하지 않는다. FAILED 완료 후 `max(180초, terminalDraftGraceSeconds)` 유예를 두고 스케줄러가 삭제한다.
4. S3 SDK 호출은 재시도 포함 120초, 시도당 30초로 제한한다. 브라우저 presigned 업로드 방식은 변경하지 않는다.
5. 삭제 직전 FAILED 상태·동일 예약 키·미정리 상태를 재검사한다. SUCCEEDED 후보는 이 경로에서 삭제하지 않는다.
6. 기존 `FAILED.generated_s3_key=NULL`과 성공 후보 정리 계약을 유지한다. 예약 키는 REST/WebSocket DTO에 노출하지 않는다.

느린 S3 정리는 `aiCleanupTaskScheduler`의 별도 스레드에서 실행하여 기본 자동 오픈/세션 검사 스케줄러를 점유하지 않는다.

## 배포·검증 주의

- V48 백엔드/DB를 먼저 배포하고, 새 댓글 페이지를 사용하는 프론트를 뒤에 배포한다. 구 백엔드에는 새 `/comments/page`가 없다.
- 기존 Flyway 파일은 수정하지 않는다. V48 이전에 이미 잃어버린 예약 키는 새 컬럼으로 자동 복구되지 않는다. 과거 고아 파일은 별도의 읽기 전용 S3/DB 대조 후 정리 범위를 결정해야 한다.
- 실 S3·운영 DB·유료 AI는 이번 로컬 테스트에서 호출하지 않는다.
- 2026-10-05 Docker 복구 후 `WriteSafetyIntegrationTest` 4개를 실제 MariaDB 10.11(Testcontainers)에서 실행하여 통과했다. 최초 리액션 동시 토글, 정원 축소/초대 참여 경쟁(6회), 1,100단계 답글 삭제, 페이지 커서와 대상 조상 경로를 검증했다. 답글 깊이에 제한을 추가하지 않는다.
- 단위 테스트는 잠금 호출 순서와 오류 재시도를 검증하지만 DB 동시성 검증을 대체하지 않는다.
- `WriteSafetyQuerySmokeTest`는 이미 사용 중인 H2로 실제 JPQL·깊은 답글·작성자 조회 수·실패 예약 조회를 검사한다. H2가 생성한 스키마를 사용하므로 MariaDB 잠금과 Flyway 업그레이드는 별도 검증이다.
- 같은 환경에서 `AiCandidateCleanupV48MigrationTest` 1개를 통과했다. V47의 기존 FAILED 행을 보존하면서 V48로 업그레이드하고, 예약 키/삭제 시각 기록, 새 인덱스와 기존 `FAILED.generated_s3_key=NULL` 제약을 확인했다. 기존 마이그레이션 파일은 변경하지 않았다.
- 실행 명령: `./gradlew test --tests '*WriteSafetyIntegrationTest' --tests '*AiCandidateCleanupV48MigrationTest' --console=plain` (Windows에서는 `gradlew.bat`). 운영과 같은 DB 엔진/주 버전 검증이며 운영 데이터·설정·부하 자체를 재현한 검증은 아니다.
- 이어서 `./gradlew test bootJar --console=plain` 전체 실행을 통과했다. JUnit XML 기준 1,683개이며 실패·오류·건너뜀은 모두 0이다. 위 MariaDB 테스트와 기존 마이그레이션·Repository·보안 회귀 테스트를 포함한다.
- 프론트 `src/**/*.test.mjs` 82개와 `npm run build`를 통과했다. 빌드의 기존 대형 청크 경고는 남아 있다.
- `frontend/tests/write-safety.browser.cjs`를 PC 1440px·모바일 390px에서 통과했다. 실제 React 화면의 댓글 이어보기/오류 후 재시도/대상 답글 경로/답글 작성/300자 입력 제한/입자 타이머 전환을 확인했다. REST·WebSocket은 로컬 시험 데이터로 대체하고 외부 요청은 차단했다.
