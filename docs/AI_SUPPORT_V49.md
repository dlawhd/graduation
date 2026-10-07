# AI 실패 문의 — V49 구현 계약

이 문서는 로컬 구현의 계약이다. 운영 배포, 운영 IAM 권한, 실제 사진 복사와 알림 수신 검증을 완료했다는 뜻은 아니다.

## 사용 흐름

실패한 AI 후보 → 운영자에게 문의하기 → 원본 미리보기/문의 설명/필수 공유 동의 → 문의 접수 → 내 문의 → 운영자 답변 알림.

- 같은 후보의 접수 완료 문의는 `접수한 문의 보기`로 표시한다. 서버에서도 생성 번호 UNIQUE와 사용자/Draft 잠금으로 중복을 막는다.
- 사진 공유에 동의하지 않으면 문의는 접수할 수 없다. 원본/다른 성공 후보 이용과 저금통 생성은 계속 가능하다.
- 공유하는 사진은 Draft에 업로드하여 서버가 정규화한 480×480 원본 전체다. 기기의 고해상도 원본이나 차단되어 만들어지지 않은 AI 결과가 아니다.
- 실패 번호, 스타일, 오류 코드, 발생 시각, 모델과 프롬프트 버전은 서버 DB에서 가져온다. 사용자 입력으로 실패 정보를 덮어쓰지 않는다.
- 문의는 AI 호출이나 자동 재생성을 하지 않으며 성공/정책 우회를 약속하지 않는다. `3030` 자체는 저작권 위반을 뜻하지 않는다.

## 권한과 운영자 지정

- 모든 API는 기존 JWT/세션/CSRF/CORS 보호를 사용한다.
- 운영 권한은 `app.support.operator-user-ids` 설정으로만 지정한다. 저금통 OWNER/ADMIN 역할과 별개다.
- `SUPPORT_OPERATOR_USER_IDS` 환경 변수에 실제 확인된 운영자 User ID를 쉼표로 지정한다. 기본값은 비어 있어 전원 거부한다.
- 운영 서버 Compose의 api 서비스에 해당 환경 변수를 전달해야 한다. `.env`에만 추가하고 컨테이너에 전달하지 않으면 적용되지 않는다.
- 이번 구현에서는 실제 계정에 권한을 부여하거나 배포 환경을 변경하지 않았다.
- 일반 사용자 문의/사진은 본인만 조회할 수 있다. 다른 사용자 ID는 404, 미인증은 401, 운영 권한 없음은 403이다.
- 운영자 상세, 목록, 사진, 상태 변경, 답변은 각각 서비스에서 운영 권한을 재검사한다. 사진 URL 발급/답변/상태 변경은 별도 감사 기록에 남긴다.
- URL은 권한 검사 후 최대 60초로 발급하고 보관 만료 시각을 넘기지 않는다. 이미 발급된 URL의 즉시 철회까지 보장하지 않는다.

## 보관과 복구

| 대상 | 보관 정책 |
| --- | --- |
| 문의 사진 사본 | 공유 동의 시점부터 30일 |
| 설명/답변 및 감사 기록 | 90일 |
| 중복 접수 방지용 ID/안전한 실패 메타데이터 | 유지 |

- `support-inquiries/{ownerId}/{UUID}.png` 비공개 영역에 원본을 복사한다. 기존 Draft/후보 정리를 중단하거나 원본 보관 기간을 무기한 늘리지 않는다.
- 복사 전에 COPYING 행과 목적 키를 커밋한다. S3 복사는 DB 트랜잭션 밖에서 실행한다. 복사가 끝나 OPEN으로 확정해야 접수 완료다.
- 실패한 복사/프로세스 종료도 목적 키를 DB에 남긴다. 120초 SDK 호출 제한보다 긴 10분 유예 후 예약 파일을 삭제하며 실패한 삭제는 다음 주기에 재시도한다.
- COPY_FAILED는 접수 미완료다. 이전 예약 파일 삭제가 확인되어야 새 UUID 키로 재접수할 수 있다. 삭제 실패로 예약 키를 잃거나 재시도 중인 파일을 지우지 않는다.
- Draft 원본 삭제와 복사가 경합하여 원본을 읽지 못하면 접수 완료로 표시하지 않고 503을 반환한다.
- 30일/90일이 지나면 실제 정리 주기 전이라도 API가 사진/본문 조회를 차단한다. 물리 삭제는 별도 스케줄러가 한 번에 최대 50건씩 진행한다.
- S3 복사에 필요한 원본 GetObject/문의 목적 PutObject, 문의 사진 GetObject/DeleteObject 권한과 비공개 설정을 배포 시 확인해야 한다. 기존 S3 Lifecycle이 문의 사본을 조기에 지우지 않는지도 확인한다.

## API와 DTO

응답은 기존 `{data: ...}` 봉투를 사용한다.

| 메서드 | 경로 | 용도 |
| --- | --- | --- |
| GET | `/api/v1/support/permissions` | 본인의 운영 메뉴 표시 여부 |
| POST | `/api/v1/support/inquiries` | `draftId`, `generationId`, `description`(1~1000자), `shareOriginal=true` |
| GET | `/api/v1/support/inquiries?before=ID` | 본인 문의 12건과 `nextBefore` |
| GET | `/api/v1/support/inquiries/for-draft/{draftId}` | 본인 Draft의 최근 문의 최대 200건, 후보 버튼 연결 |
| GET | `/api/v1/support/inquiries/{id}` | 본인 상세 |
| GET | `/api/v1/support/inquiries/{id}/image` | 사진 URL 별도 발급 |
| GET | `/api/v1/admin/support/inquiries?before=ID&status=OPEN` | 운영 목록/처리 상태 필터 |
| GET | `/api/v1/admin/support/inquiries/{id}` | 운영 상세/모델/프롬프트 버전 |
| GET | `/api/v1/admin/support/inquiries/{id}/image` | 공유 사진 열람/감사 기록 |
| POST | `/api/v1/admin/support/inquiries/{id}/review` | OPEN → IN_PROGRESS |
| POST | `/api/v1/admin/support/inquiries/{id}/reply` | `reply`(1~3000자), 답변 완료/알림 |

- 접수 완료: HTTP 200(동일 후보 재접수도 기존 결과 반환). 파일 보관 중: 409, 원본 만료: 410, 시간당 10건 제한: 429, 사진 복사 실패: 503.
- 문의 상태: 사용자 처리 상태 OPEN/IN_PROGRESS/ANSWERED, 파일 보관 상태 COPYING/COPY_FAILED.
- 상세/목록은 `inquiryId`, `generationId`, `draftId`, `style`, `errorCode`, `failedAt`, `description`, `reply`, `status`, 날짜, `imageAvailable`, `contentExpired`를 반환한다. S3 키, 사진 URL, 제공자 응답/프롬프트 원문, 자격 증명은 포함하지 않는다.
- 모델/프롬프트 버전은 운영자 상세에만 포함한다. 문의 로그에는 문의 ID만 남긴다.
- 답변은 잠금 안에서 1회 확정한다. 알림 `SUPPORT_REPLIED`와 `inquiryId`를 추가하며 기존 6필드 payload/기존 DTO 호출은 호환 생성자를 유지한다. 알림은 답변 커밋 후 기존 개인 알림 topic으로 전송한다.

## DB와 검증

- V49는 `support_inquiries`와 `support_inquiry_audits`를 추가하고 기존 알림 CHECK에 SUPPORT_REPLIED만 추가한다. V48 이하 마이그레이션은 변경하지 않는다.
- 사용자/후보/Draft FK, 생성 번호 UNIQUE, 사진 키 UNIQUE, 상태/답변 CHECK, 목록/정리 인덱스를 사용한다.
- 테스트: 동의/길이 검증, 소유권/운영자 차단, 원문/키 비노출, 복사 실패/삭제 재시도/보관 만료, MariaDB 동시 접수/시간당 제한/동시 답변과 단일 알림, V48→V49 업그레이드, 기존 알림/인증 회귀.
- DEV 전용 `frontend/tests/support-preview.html`은 로컬 합성 이미지와 메모리 어댑터만 사용한다. 알려지지 않은 요청은 모두 차단하며 운영 진입점에는 포함하지 않는다.

### 2026-10-07 로컬 검증 결과

- `gradlew.bat test bootJar`: 127개 테스트 클래스, 1,789개 테스트 통과. 실패/오류/건너뛴 테스트 0개.
- 문의 전용 테스트: 안전성 17개, MariaDB 동시성/보관 통합 5개, V48→V49 마이그레이션 1개 통과. 기존 인증 테스트에도 문의 로그인/CSRF/운영 권한 검증을 추가했다.
- 프론트 `node --test` 전체: 93개 통과. `npm run build` 성공. 기존 메인 번들 500KB 초과 경고는 남아 있으며 문의함 화면은 별도 지연 로딩 청크로 분리했다.
- 실제 컴포넌트를 로컬 합성 데이터로 구동하여 PC/390px 모바일에서 필수 동의, 원본 확인, 입력 유지, 오류 후 재시도, 기존 문의 보기, 빈 목록, 운영 권한 없음, 상태 변경/답변 표시를 확인했다. 실제 S3 복사나 운영 알림 수신 검증으로 간주하지 않는다.
- S3 복사와 삭제, 알림 전송은 테스트 대역을 사용했다. 실제 사진 업로드, 유료 AI 생성, 메일 발송은 하지 않았다.

## 주요 파일과 변경 범위

| 영역 | 파일/위치 | 변경 |
| --- | --- | --- |
| 실패 후보 | `frontend/src/features/jarDesign/components/AiCandidateGallery.jsx` | 문의 버튼, 기존 문의 연결, 편집 화면 유지 |
| 문의 화면 | `frontend/src/features/support/`, `frontend/src/pages/SupportInquiriesPage.jsx` | 필수 공유 동의 창, 본인/운영 문의함, 상태와 답변 |
| 프론트 API/진입점 | `frontend/src/api/supportApi.js`, `frontend/src/App.jsx`, `frontend/src/components/layout/MobileHeaderMenu.jsx` | 기존 인증 재사용, PC/모바일 메뉴, 답변 알림 이동 |
| 서버 API | `src/main/java/shop/esjh/memoryjar/controller/support/`, `dto/support/` | 요청 검증, 안전한 DTO, 본인/운영 API 분리 |
| 상태와 권한 | `src/main/java/shop/esjh/memoryjar/service/support/`, `entity/support/`, `repository/support/`, `enums/support/` | 예약/확정, 소유권, 별도 운영 권한, 잠금, 정리/재시도 |
| 설정 | `config/SupportConfig.java`, `config/properties/SupportProperties.java`, `config/SchedulerConfig.java`, `src/main/resources/application.yml` | 기본 거부 운영자 설정과 독립 정리 스케줄러 |
| 알림 | `service/notification/NotificationService.java`, `model/notification/NotificationPayload.java`, `dto/notification/response/NotificationItemResponse.java`, `enums/notification/NotificationType.java` | 답변 알림 추가, 기존 생성자/기존 알림 유지 |
| DB | `src/main/resources/db/migration/V49__create_ai_support_inquiries.sql` | 문의/감사 테이블과 알림 CHECK 확장 |
| 검증 | `src/test/java/shop/esjh/memoryjar/service/support/`, `migration/SupportInquiryV49MigrationTest.java`, `config/SecurityConfigTest.java`, `frontend/src/features/support/supportView.test.mjs`, `frontend/tests/support-preview.*` | 권한/동의/동시성/복구/호환/로컬 화면 검증 |

서버 경로에서 패키지 상대 경로는 `src/main/java/shop/esjh/memoryjar/`를 기준으로 한다. 변경 전부터 있던 AI 제작 순서/주의 안내의 미커밋 변경은 보존했다.

## 운영 적용 전 남은 확인

1. 승인된 운영자 User ID를 결정하고 api 컨테이너에 `SUPPORT_OPERATOR_USER_IDS`를 전달한다. 실제 권한 부여는 이번 작업에서 하지 않았다.
2. 문의 사진 영역의 S3 비공개 정책, 복사/조회/삭제 IAM 권한과 Lifecycle을 확인한다.
3. V49 적용을 포함한 백엔드를 먼저 배포한 뒤 프론트를 배포한다. 기존 알림을 보존하지만 새 알림이 저장된 뒤 구버전 백엔드로의 단순 롤백은 새 enum 값을 처리하지 못할 수 있다.
4. 동의한 테스트 사진으로 운영 접수 1건 → 운영자 확인/답변 → 본인 알림과 답변 확인을 검증한다. 로컬 테스트 통과를 운영 검증 완료로 표현하지 않는다.
