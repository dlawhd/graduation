# Memory Jar AI 커스텀 디자인 — ERD 및 DB 계약 v1

> 문서 상태: **논리 계약 + 현재 구현 대조**. 이 문서의 테이블 계약은 Flyway V32와 V33으로 반영되어 있다. Slot의 실제 렌더링 공식·Editor는 23번에서 구현했다. 실제 운영 DB 적용, S3/Cloudflare 실연동, 최종 UX·기존 Jar 화면 연결은 별도 검증·구현 항목이다.

> 검토 이력: 2026-09-20 현재 작업 폴더 기준. 신규 3개 테이블·39열과 기존 `jars` 무변경 설계는 유지한다. V33은 `jar_design_drafts.original_s3_deleted_at`을 추가해 Draft 원본 S3 정리 성공을 재시도 가능하게 기록한다.

> 적용 범위: Jar 생성 **전** 커스텀 디자인. `jars`의 기존 컬럼은 변경하지 않는다.

> Codex 작업 원칙: 기존 V1~현재 최신 Flyway는 수정하지 말 것. 여기서 **확정**과 **구현 전 결정/검증**을 구별할 것. 기존 Jar 생성 로직과 권한을 우회하지 말 것.

## 1. 핵심 불변식과 흐름 [확정]

- 처음부터 기본 저금통을 선택하면 기존 Jar 생성 기능으로 `jars`를 만들고 끝낸다. Draft, AI Generation, JarDesign을 만들지 않는다.

- 직접 그리기를 선택하고 `[그림 완성]`을 누르면 검증된 원본 PNG를 Private S3에 저장하고 Draft를 생성한다. **한 Draft의 원본은 이후 변경하지 않는다.** 다시 그리기는 새 Draft다.

- **원본 그림의 부적절한 콘텐츠 검사 요구사항은 유지한다.** 검사를 통과하지 못한 원본은 AI 변환과 ORIGINAL 최종 사용 모두 금지한다. 검사 기술·판정 기준·검사 장애 시 처리 방식은 별도 결정하며, 이 문서는 검사가 이미 구현됐다고 주장하지 않는다. **현재 Draft 스키마에 심사 상태 컬럼이 없으므로, 심사 완료 전 원본을 승인된 ACTIVE Draft로 취급해서는 안 된다.** 동기 심사라면 Draft 생성 전 승인 여부를 결정하고, 비동기 심사를 채택한다면 미완료/실패 결과를 요청마다 안전하게 구별하는 영속화·접근 차단 방식을 먼저 설계해야 한다. 새 컬럼/테이블 추가는 아직 결정하지 않았다.

- AI 생성은 Jar 생성 **이전**에 Draft에 속한 Generation으로 기록한다. AI를 호출할 때 아직 Jar ID가 없다.

- 원본(ORIGINAL) 또는 성공한 AI 후보를 선택하고 Slot 위치·크기를 정한 뒤 최종 Jar를 생성한다. 이때만 `jar_designs` 1행을 만든다.

- 그림을 그리다가 기본 디자인(DEFAULT)을 선택해 최종 Jar를 생성할 수 있다. 이때 Draft는 `FINALIZED`이고 `jar_designs`는 **없다**.

- Jar 생성 후 디자인·선택 후보·Slot 변경 및 AI 추가 생성은 불가하다. 기존 Jar의 `theme`은 UI 테마로 유지하며 이미지 색상과 연동하지 않는다.

- Draft 조작과 AI 생성·최종화는 Draft OWNER만 수행한다. 완성된 이미지는 기존 Jar 열람 권한에 따라 제공한다.

- **신규 AI 디자인 테이블에는** URL이나 토큰을 저장하지 않는다. 비공개 S3 **Object Key**만 저장하고, 조회 시 권한 확인 후 짧은 수명의 PreSigned GET URL을 발급한다. 기존 다른 테이블의 저장 정책을 이 문서만으로 변경하지 않는다.

- 원본·후보·영구 이미지의 S3 Key는 서버가 정해 허용된 경로로 생성한다. 프론트가 임의의 Key나 다른 사용자의 Key를 전달해 원본·후보·최종 이미지로 채택하지 못하도록 한다.
- **원본의 불변성은 DB Key를 변경하지 않는 것만으로 보장되지 않는다.** 승인된 원본이 들어 있는 S3 객체도 다른 요청이나 정리 작업에 의해 덮어써지지 않도록 고유 Key·쓰기 권한·덮어쓰기 방지 방식을 검증한다. 콘텐츠 검사와 저장/AI 입력에 사용하는 이미지가 동일한 바이트의 객체인지 확인한다. 구체적인 S3 쓰기 방식은 구현 단계에서 결정한다.

- 원본은 실제 PNG/JPEG/WebP 단일 프레임인지와 디코딩 가능 여부를 서버에서 검증하고, 최대 10MB 입력을 흰 배경의 `480×480` PNG로 정규화한다. MIME 헤더만으로 통과시키지 않으며 Rekognition 심사는 fail-closed로 동기 처리한다.

## 2. 텍스트 ERD [확정]

```text

users (기존; 실제 PK는 최신 Flyway 확인)

  1 ── N jar_design_drafts.owner_id

jar_design_drafts.draft_id (PK)

  1 ── 0..N jar_ai_generations.draft_id  [Generation은 항상 한 Draft 소속]

  0..1 ── 0..1 jars.jar_id             [drafts.finalized_jar_id; UNIQUE]

jar_design_drafts.(selected_generation_id, draft_id)

  0..1 ──> jar_ai_generations.(generation_id, draft_id)

           [현재 선택한 AI 후보; NULL이면 후보 선택 없음]

jars.jar_id (기존 PK)

  1 ── 0..1 jar_designs.jar_id         [UNIQUE; 커스텀인 경우만 존재]

jar_designs.selected_generation_id

  0..1 ──> jar_ai_generations.generation_id

           [AI 디자인일 때만 참조; UNIQUE로 중복 최종 선택 방지]

```

- Draft의 `selected_generation_id`는 해당 **동일 Draft**의 Generation만 참조하도록 `(selected_generation_id, draft_id) -> (generation_id, draft_id)` 복합 FK를 사용한다. nullable 복합 FK의 실제 NULL 동작은 4번 단계에서 시험한다.

- 위 그림은 **테이블 관계를 설명하는 텍스트 ERD**다. `jars`의 기존 사용자·멤버십 등 전체 관계를 다시 그린 완전한 운영 ERD는 아니다. 신규 테이블과 기존 테이블 간 실제 FK는 §7을 기준으로 확인한다.

- `jar_designs`에 행이 없으면 기존 기본 Jar다. 기존 Jar에 DEFAULT 행을 채우는 Backfill은 하지 않는다.

- `jar_designs`의 AI Generation이 최종화된 Draft에 속하는지까지는 **현재 컬럼만으로 DB FK가 직접 보장하지 못한다**. 최종화 Service에서 동일 Draft·SUCCEEDED·미삭제 객체를 검사한다.

- **테이블 간 최종 일치 검증:** FINALIZED+ORIGINAL/AI에는 연결된 Jar의 `jar_designs`가 정확히 1행 있어야 하고, FINALIZED+DEFAULT에는 없어야 한다. `jar_designs.design_type`과 Draft 최종 선택 종류도 일치해야 한다. AI인 경우 Draft와 JarDesign에 기록된 선택 Generation ID도 일치해야 한다. 이 관계 전체는 현 3개 테이블의 단일 CHECK/FK로 강제되지 않으므로 Jar 생성·Design 저장·Draft FINALIZED를 한 트랜잭션에서 처리하고 테스트한다.

- **OWNER 정합성:** Draft의 `owner_id`, 새로 생성한 Jar의 실제 OWNER, 로그인 요청자가 동일한지도 Service에서 확인한다. 기존 Jar 생성의 OWNER 멤버십·설정 검증을 빠뜨리지 않는다. 이 관계는 위 신규 FK만으로 증명되지 않는다.

## 3. 신규 테이블 A: `jar_design_drafts` [14열; V33 반영]

| 컬럼 | 논리 타입 | NULL | 제약/의미 |

|---|---|---|---|

| `draft_id` | BIGINT | NO | AUTO_INCREMENT PK |

| `owner_id` | BIGINT | NO | 기존 users의 **실제 PK**를 참조 |

| `original_s3_key` | VARCHAR(512) | NO | 고정된 원본 PNG의 Private S3 Key; 터미널 상태에서 정리된 뒤에도 과거 Key 기록으로 남을 수 있음 |

| `original_s3_deleted_at` | DATETIME(6) | YES | V33. 터미널 Draft의 원본 S3 삭제가 실제로 성공한 뒤에만 기록하며, NULL이면 다음 정리 주기에 재시도 대상 |

| `selected_design_type` | VARCHAR(20) | YES | NULL(미선택), ORIGINAL, AI, DEFAULT |

| `selected_generation_id` | BIGINT | YES | AI 선택 시에만, 동일 Draft의 Generation FK |

| `slot_center_x` | DECIMAL(6,5) | YES | 전체 **실제 이미지 영역** 기준 중심 X, [0,1] |

| `slot_center_y` | DECIMAL(6,5) | YES | 전체 실제 이미지 영역 기준 중심 Y, [0,1] |

| `slot_size_ratio` | DECIMAL(6,5) | YES | 크기 슬라이더의 정규화 값 [0,1]; 실제 이미지 폭 비율과 다름 |

| `status` | VARCHAR(20) | NO | 기본 ACTIVE; ACTIVE, FINALIZED, ABANDONED, EXPIRED |

| `finalized_jar_id` | BIGINT | YES | FINALIZED일 때만 기존 jars의 jar_id, UNIQUE |

| `expires_at` | DATETIME(6) | NO | 생성 시/의미 있는 사용자 쓰기 후 현재 시각 + 7일 |

| `created_at` | DATETIME(6) | NO | 생성 시각 |

| `updated_at` | DATETIME(6) | NO | 수정 시각 |

### Draft의 값 조합 [확정]

| 상태/선택 | selected_generation_id | Slot 3개 | finalized_jar_id |

|---|---|---|---|

| ACTIVE + 미선택 | NULL | 모두 NULL | NULL |

| ACTIVE + ORIGINAL | NULL | 아직 설정 전 모두 NULL 또는 모두 값 | NULL |

| ACTIVE + AI | 같은 Draft의 Generation ID | 아직 설정 전 모두 NULL 또는 모두 값 | NULL |

| ACTIVE + DEFAULT | NULL | 모두 NULL로 정리 | NULL |

| FINALIZED + ORIGINAL | NULL | 모두 필수 | 필수 |

| FINALIZED + AI | 필수 | 모두 필수 | 필수 |

| FINALIZED + DEFAULT | NULL | 모두 NULL | 필수 |

| ABANDONED / EXPIRED | 기존 선택 기록 유지 가능 | 기존 선택 기록 유지 가능 | NULL |

- ACTIVE에서 AI 후보를 선택할 때 Generation은 `SUCCEEDED`, `s3_deleted_at IS NULL`, 동일 Draft여야 하며 S3 객체가 실제 사용 가능해야 한다.

- ORIGINAL/AI에서 DEFAULT를 선택할 때 `selected_generation_id`와 Slot 3개를 모두 NULL로 바꾼다. **DEFAULT와 미선택(NULL) 상태에서는 FINALIZED 여부와 무관하게 Slot을 모두 NULL로 유지**한다. 다른 ORIGINAL/AI 후보로 바꿀 때 Slot은 **새 이미지에 대해 재확인**해야 한다. 구현에서는 값을 지우고 재설정하도록 하는 방식을 우선 검토한다.

- `status=ACTIVE`여도 `expires_at <= now`이면 변경·AI 생성·최종화를 금지한다. GET은 만료를 연장하지 않는다. **만료 시각 갱신은 의미 있는 사용자 조작에 한정**하고, Scheduler 실행이나 늦게 끝난 AI 작업만으로 연장하지 않는다. 만료 시각과 `created_at`의 순서는 4번에서 검증한다.

- 브라우저 종료는 ABANDONED가 아니다. 사용자의 명시적 취소만 ABANDONED이며, 비활성 7일은 EXPIRED다. 종료 상태는 ACTIVE로 되돌리지 않는다.

## 4. 신규 테이블 B: `jar_ai_generations` [17열 확정]

| 컬럼 | 논리 타입 | NULL | 제약/의미 |

|---|---|---|---|

| `generation_id` | BIGINT | NO | AUTO_INCREMENT PK |

| `draft_id` | BIGINT | NO | 소속 Draft FK |

| `ai_style` | VARCHAR(30) | NO | CUTE_2D, SOFT_25D, WATERCOLOR, HAND_DRAWN, WEIRDO, PIXEL |

| `status` | VARCHAR(20) | NO | 기본 PROCESSING; PROCESSING, SUCCEEDED, FAILED |

| `ai_provider` | VARCHAR(40) | NO | 현재 CLOUDFLARE_WORKERS_AI; Java Enum |

| `ai_model` | VARCHAR(150) | NO | 현재 `@cf/black-forest-labs/flux-2-klein-4b`; 문자열 |

| `prompt_version` | VARCHAR(100) | NO | 실제 사용한 버전 조합; 과거 버전 불변 |

| `seed` | BIGINT | YES | 생성 시드; 동일 시드라도 결과 동일 보장은 아님 |

| `reference_image_version` | VARCHAR(50) | YES | PIXEL에만 필수, 현재 PIXEL_REF_V1 |

| `postprocess_version` | VARCHAR(50) | YES | PIXEL에만 필수, 현재 PIXEL_PP_V1 |

| `generated_s3_key` | VARCHAR(512) | YES | SUCCEEDED 시 **최종 후보** Private S3 Key, Raw 이미지 아님 |

| `s3_deleted_at` | DATETIME(6) | YES | 임시 후보 S3 객체 삭제 완료 시각; 삭제 뒤에도 Key 기록 유지 |

| `error_code` | VARCHAR(50) | YES | FAILED에만 필수 |

| `error_message` | VARCHAR(1000) | YES | FAILED에만 가능한 정제된 내부 설명 |

| `created_at` | DATETIME(6) | NO | 생성 시작, stale 판별 기준 |

| `completed_at` | DATETIME(6) | YES | 성공·실패 종료 시각 |

| `updated_at` | DATETIME(6) | NO | 변경 시각 |

### 상태별 정확한 조합 [확정]

| 상태 | generated_s3_key | s3_deleted_at | error_code | error_message | completed_at |

|---|---|---|---|---|---|

| PROCESSING | NULL | NULL | NULL | NULL | NULL |

| SUCCEEDED | 필수 | NULL 또는 삭제 완료 시각 | NULL | NULL | 필수 |

| FAILED | NULL | NULL | 필수 | NULL 또는 정제된 설명 | 필수 |

- 실패 코드: `SOURCE_IMAGE_LOAD_FAILED`, `PROVIDER_REQUEST_FAILED`, `PROVIDER_TIMEOUT`, `PROVIDER_RATE_LIMITED`, `PROVIDER_INVALID_RESPONSE`, `PIXEL_POSTPROCESS_FAILED`, `S3_UPLOAD_FAILED`, `GENERATION_TIMEOUT`, `INTERNAL_ERROR`.

- `s3_deleted_at`이 NULL이어도 S3 객체의 존재까지 보장하지 않는다. 존재와 접근 가능성은 실제 최종화 시 확인한다.

- PIXEL만 사용자 스케치 + 버전 관리된 픽셀 스타일 참조의 두 이미지 입력을 사용한다. Java Client는 `input_image_0`과 `input_image_1` multipart 요청·응답 파싱을 단위 테스트로 검증했다. 실제 Cloudflare 계정 호출은 운영 검증으로 남는다. 다른 스타일의 Reference/후처리 버전은 NULL이다. PIXEL_PP_V1은 흰 배경 합성 후 64×64 bilinear 축소, 최대 24색 median-cut 팔레트, nearest-neighbor 480×480 처리다.
- AI 응답 성공 여부와 **유효한 최종 이미지 생성 여부는 구분**한다. 응답은 실제 이미지 바이트를 디코딩하고 `1024×1024` 정사각형·PNG 변환을 검증한 뒤, PIXEL은 Java 후처리 결과를 검증해 Private S3에 저장해야 SUCCEEDED가 된다. 다른 스타일에도 480×480을 강제하지 않는다.

- 재생성은 새로운 Generation이다. 과거 성공 결과와 실패 기록을 덮어쓰지 않는다. `created_by`, `jar_id`, `source_upload_id`, `generated_url` 컬럼은 만들지 않는다.

- 기존 합의상 사용자/서비스별 **고정 생성 횟수 제한은 v1에 없다**. 동시 요청은 Draft당 PROCESSING 1건으로 제한하며 Backend에서 보장한다. Cloudflare 제공 한도·429 대응과 모니터링은 별개다.

## 5. 신규 테이블 C: `jar_designs` [9열 확정]

| 컬럼 | 논리 타입 | NULL | 제약/의미 |

|---|---|---|---|

| `jar_design_id` | BIGINT | NO | AUTO_INCREMENT PK |

| `jar_id` | BIGINT | NO | 기존 Jar FK, UNIQUE |

| `design_type` | VARCHAR(20) | NO | ORIGINAL 또는 AI만; DEFAULT 행 금지 |

| `final_s3_key` | VARCHAR(512) | NO | 임시 객체와 별개의 영구 Private S3 이미지 Key |

| `selected_generation_id` | BIGINT | YES | ORIGINAL=NULL, AI=필수; FK 및 UNIQUE |

| `slot_center_x` | DECIMAL(6,5) | NO | [0,1] |

| `slot_center_y` | DECIMAL(6,5) | NO | [0,1] |

| `slot_size_ratio` | DECIMAL(6,5) | NO | [0,1] |

| `created_at` | DATETIME(6) | NO | 확정 시각; updated_at 없음 |

- `jar_designs` 행은 Jar가 가진 커스텀 이미지의 존재를 뜻한다. 없는 Jar는 기존 Theme/CSS 저금통으로 렌더링한다.

- 최종화된 디자인·Slot은 불변이다. `updated_at`이 없다는 사실만으로 DB UPDATE를 막지는 못한다. Service에서 수정 API를 제공하지 않고 접근 제어하며, 필요하면 별도의 DB 권한/감사 정책을 검토한다.

- 영구 S3 Key 예시: `jar-designs/{ownerId}/{uuid}/final.png`. **UUID 영구 경로는 구현 제안이지 이 대화에서 파일명까지 고정한 요구사항은 아니다.** 실제 저장 규칙은 구현 시 정한다. 최종 객체는 요청마다 별도 Key를 사용하고 이미 확정된 객체를 덮어쓰지 않도록 설계한다.

- 최종 Jar 이미지가 삭제된 임시 Draft 객체에 의존해서는 안 된다. 최종화 후에도 기존 Jar 열람 정책으로 접근 가능한 **별도의 영구 객체**를 유지해야 한다.

## 6. 기존 `jars` [변경 없음]

- 기존 Jar의 PK·OWNER·이름·멤버십·테마·오픈 정책·soft delete 등은 현재 소스의 동작을 그대로 유지한다.

- `active_ai_generation_id`, `active_design_id`, `design_type`, `final_s3_key`, Slot 컬럼을 `jars`에 추가하지 않는다.

- `jars.theme`은 UI 테마이고 커스텀 이미지의 색상은 변경하지 않는다.

- 기존 Jar Backfill 없음. 처음부터 기본 Jar는 기존 생성 API/Service를 그대로 사용한다.

- Draft의 DEFAULT 최종화는 **기존 Jar 생성의 내부 핵심 로직**(기존 검증·OWNER 멤버십 등의 부수 작업 포함)을 같은 DB 트랜잭션에서 재사용한다. 프론트가 기존 Jar 생성 API를 호출하고 별도 Draft 완료 API를 호출하는 방식은 사용하지 않는다.

- **트랜잭션 경계 확인:** 기존 Jar 생성 핵심 로직이 별도의 독립 트랜잭션으로 먼저 COMMIT하지 않는지, Draft FINALIZED와 Jar/OWNER 멤버십 생성이 하나의 DB 트랜잭션으로 묶이는지 구현 시 확인한다. 특히 중복 호출·롤백 테스트가 필요하다.

## 7. FK / UNIQUE / 인덱스 계약 [논리 설계 확정, 물리 SQL 검증 전]

### FK

| 이름(의미) | 자식 → 부모 | 기존에 제안한 ON DELETE |

|---|---|---|

| Draft 소유자 | `jar_design_drafts.owner_id → users.<실제 PK>` | RESTRICT |

| 생성 소속 | `jar_ai_generations.draft_id → jar_design_drafts.draft_id` | CASCADE |

| Draft의 현재 AI 후보 | `jar_design_drafts.(selected_generation_id,draft_id) → jar_ai_generations.(generation_id,draft_id)` | RESTRICT |

| Draft의 최종 Jar | `jar_design_drafts.finalized_jar_id → jars.jar_id` | RESTRICT |

| Jar의 커스텀 디자인 | `jar_designs.jar_id → jars.jar_id` | CASCADE |

| 최종 디자인의 AI 출처 | `jar_designs.selected_generation_id → jar_ai_generations.generation_id` | RESTRICT |

**주의:** Draft ↔ Generation은 순환 FK이고, finalized Draft → Jar는 RESTRICT다. 위 ON DELETE는 지금까지 제안한 정책을 기록한 것이며 **물리 삭제 동작이 안전하다고 검증된 최종 SQL은 아니다**. 일반 Jar soft delete에서는 CASCADE가 동작하지 않는다. Generation 이력을 보관하기로 했으므로 Draft/Generation 물리 삭제는 기본 운영 흐름이 아니다. 물리 삭제나 회원 탈퇴에 따른 삭제가 필요하면 참조 관계·보존 요구·S3 삭제를 함께 검토하고 삭제 순서와 FK 전략을 별도로 확인한다.

### 키/인덱스

| 테이블 | 키/인덱스 | 이유 |

|---|---|---|

| Draft | PK `(draft_id)` | 식별 |

| Draft | UNIQUE `(finalized_jar_id)` | Jar당 연결 Draft 최대 1개; NULL 여러 건 허용 여부 DB 확인 |

| Draft | INDEX `(owner_id, status)` | 사용자별 Draft |

| Draft | INDEX `(status, expires_at)` | 만료 Scheduler |

| Generation | PK `(generation_id)` | 식별 |

| Generation | UNIQUE `(generation_id, draft_id)` | Draft 선택의 복합 FK 참조 |

| Generation | INDEX `(draft_id, status, created_at)` | Draft 후보/PROCESSING 검색 |

| Generation | INDEX `(status, created_at)` | stale 처리 |

| JarDesign | PK `(jar_design_id)` | 식별 |

| JarDesign | UNIQUE `(jar_id)` | Jar당 커스텀 디자인 최대 1개 |

| JarDesign | UNIQUE `(selected_generation_id)` | AI 후보의 최종 사용 최대 1회 |

복합 FK용 인덱스, 기존 FK가 자동 생성하는 인덱스와 중복되는 것은 MariaDB 10.11에서 migration 작성 시 확인한다. `UNIQUE(draft_id,status)`는 여러 SUCCEEDED 후보를 막으므로 만들지 않는다.

**S3 Key 중복 방지 [구현 전 검증]:** 현재 Key 컬럼 3개에는 UNIQUE가 확정되어 있지 않다. 서버가 원본·후보·영구 객체마다 충돌하지 않는 Key를 생성하고 기존 객체를 덮어쓰지 않는지 검증한다. 하나의 실제 S3 객체를 서로 다른 Draft/Generation/JarDesign이 공유하게 된다면 한쪽 정리가 다른 쪽 이미지를 지울 수 있다. 해당 컬럼의 UNIQUE 추가 여부와 저장 Key 네임스페이스 정책은 4번 단계에서 검토하며, 현 문서만으로 임의의 인덱스를 추가하지 않는다.

## 8. CHECK / 서버 검증 계약 [조건 확정, DDL 검증 전]

**SQL의 CHECK는 FALSE일 때만 실패한다. `NULL`이 개입해 UNKNOWN이 되면 통과할 수 있으므로, 최종 SQL에서는 `IS NULL`/`IS NOT NULL`로 완전히 결정되는 식을 사용한다.** 예시 식을 그대로 무검증 배포하지 말 것.

### Draft

1. `selected_design_type`은 NULL 또는 ORIGINAL/AI/DEFAULT.

2. 선택 종류가 AI일 때만 `selected_generation_id`가 NOT NULL. 나머지는 NULL.

3. Slot 3개는 모두 NULL이거나 모두 NOT NULL이며 각각 0~1. **디자인이 미선택(NULL)이거나 DEFAULT라면 ACTIVE·종료 상태를 막론하고 Slot 3개는 전부 NULL**이어야 한다. ORIGINAL/AI의 ACTIVE 단계에서는 아직 설정 전일 수 있다.

4. `status`는 ACTIVE/FINALIZED/ABANDONED/EXPIRED.

5. `status=FINALIZED`인 경우에만 `finalized_jar_id` NOT NULL. 그 외에는 NULL.

6. **FINALIZED이면 `selected_design_type IS NOT NULL`을 명시적으로 요구**. FINALIZED+DEFAULT면 Gen 및 Slot 전부 NULL, FINALIZED+ORIGINAL이면 Gen NULL/Slot 전부 NOT NULL, FINALIZED+AI이면 Gen NOT NULL/Slot 전부 NOT NULL.

7. 현재 Draft 선택 Generation이 같은 Draft인지는 복합 FK; 그 Generation이 SUCCEEDED이고 아직 사용 가능한지는 Service 검사.

### Generation

1. `ai_style` 6종, `status` 3종; 실패 코드 허용 집합 검증.

2. PROCESSING: key/error_code/error_message/completed_at/s3_deleted_at 모두 NULL.

3. SUCCEEDED: key 및 completed_at 필수, error_code/error_message NULL. `s3_deleted_at`은 NULL 또는 값.

4. FAILED: key/s3_deleted_at NULL, error_code 및 completed_at 필수, error_message 선택.

5. PIXEL은 reference_image_version/postprocess_version 모두 NOT NULL. 다른 스타일은 둘 다 NULL. **특정 버전 V1 문자열로 DB를 영구 고정하지 말 것**(버전 변경 가능).

6. Generation의 `completed_at >= created_at`, `s3_deleted_at >= completed_at` 및 **Draft의** `expires_at >= created_at` 등 시간 순서 제약은 기존 DB 시간 정책과 함께 4번 단계에서 채택/검증한다. (`expires_at`은 Generation 컬럼이 아니다.) 과거 기록을 임의로 고치지는 않는다.

7. 필수 S3 Key·모델명·프롬프트 버전의 **빈 문자열**은 NOT NULL만으로 막히지 않는다. 서비스 검증 및 필요 시 CHECK로 빈 값/공백을 방지한다.

### JarDesign

1. ORIGINAL 또는 AI만 허용. ORIGINAL이면 Generation NULL, AI면 Generation NOT NULL.

2. 최종 S3 Key 및 Slot 3개 NOT NULL, Slot 각 0~1.

3. **DB FK만으로 보장되지 않는 것:** AI Generation의 SUCCEEDED 여부, Generation ↔ 최종 Draft ↔ Jar의 동일 소유 관계, S3 객체의 실재, Slot 전체가 이미지 안에 들어오는지. 최종화 Service에서 검사.

### 상태 전이 검증

CHECK는 값의 모양만 검증한다. `FINALIZED → ACTIVE`, `FAILED → SUCCEEDED` 같은 **이전 값과의 전이**는 CHECK만으로 금지할 수 없다. Service의 잠금/조건부 UPDATE와 테스트에서 보장한다.

## 9. 작업·동시성·파일 처리 [구현 계약]

### AI 생성

1. 짧은 DB 트랜잭션에서 Draft 행을 잠그고 OWNER/ACTIVE/비만료를 확인한다.

2. 같은 Draft에 PROCESSING Generation이 있으면 중복 생성 요청을 거절하고, 없으면 새 PROCESSING 행을 저장한 뒤 COMMIT한다.

3. **DB 트랜잭션 밖에서** Private S3 원본 로드 → Cloudflare 요청 → 필요 시 PIXEL Java 후처리 → 최종 PNG 검증·Rekognition 심사 → 임시 S3 업로드.

4. 짧은 DB 트랜잭션에서 아직 PROCESSING이며 Draft가 유효할 때만 SUCCEEDED로 전환한다. 늦게 도착한 응답이나 이미 FAILED인 시도는 SUCCEEDED로 되돌리지 않고 생성 파일을 정리한다.

5. 실패 시 **해당 PROCESSING Generation 행을 FAILED로 전환**한다. 실패마다 별도의 FAILED 행을 추가하지 않는다. 이전 성공 후보·원본은 유지한다. PROCESSING 10분 이상은 `GENERATION_TIMEOUT`으로 FAILED 처리한다.

6. 동일 Draft의 모든 생성 시작/종료와 Draft 종료가 **같은 Draft 행을 조정 지점으로 사용**하도록 구현한다. 단순 조회 후 무잠금 저장은 경쟁 조건을 막지 못한다. 성공 반영과 Timeout/취소/만료가 경합할 때는 현재 PROCESSING 여부를 잠금 또는 조건부 UPDATE로 확인하고, 늦은 결과가 올린 S3 객체는 별도 정리한다.

### Finalize

1. Draft OWNER/ACTIVE/비만료, 선택 종류, 최종 Slot, 선택 Generation 및 S3 객체를 검증한다.

2. ORIGINAL/AI면 별도의 영구 S3 객체를 준비한다. S3 복사로 DB 트랜잭션을 오래 열지 않는다.

3. 짧은 DB 트랜잭션에서 Draft 잠금 및 상태/선택을 **다시 확인**한다. 특히 S3 복사 전 확인한 **선택 종류·Generation ID·Slot 값**이 복사 후에도 동일한지 검증한다. 값이 달라졌다면 그 복사본으로 확정하지 않는다. 기존 Jar 생성 핵심 로직을 호출하고, ORIGINAL/AI일 때만 JarDesign을 만들며, 같은 트랜잭션에서 Draft를 FINALIZED로 바꾼다.

4. COMMIT 후 임시 파일을 정리한다. 롤백이면 해당 요청이 만든 영구 S3 객체를 보상 삭제한다. 이미 다른 요청이 확정한 객체를 삭제하지 않는다. **DB COMMIT 직후 응답 유실/프로세스 종료가 발생할 수 있으므로**, 보상 삭제는 성공한 다른 최종화를 침해하지 않도록 DB 참조 여부를 확인해야 한다.

5. 재요청에서 이미 FINALIZED면 새 Jar를 만들지 않는다. `finalized_jar_id`로 기존 결과를 안내할 수 있지만, **현재 스키마에 요청 본문 해시/멱등키가 없으므로 재요청의 완전한 동등성을 DB만으로 증명할 수는 없다.** 서로 다른 요청은 변경/중복 생성으로 처리하지 않고 충돌로 거절하는 등 API 규칙을 정한다. 기존 Jar의 접근 권한과 soft-delete 상태도 확인한 뒤 안내하며, 과거에 발급한 URL을 무조건 재사용하지 않는다.

### 취소/만료/PROCESSING 경합 — 확정 정책

- 합의된 불변식: 종료된 Draft에 새 SUCCEEDED 후보가 노출되지 않아야 하며, 시간 초과 FAILED 결과가 늦게 SUCCEEDED로 바뀌면 안 된다.

- v1에서는 PROCESSING 중 DEFAULT/ORIGINAL/AI 최종화와 사용자 취소를 거절하고, 생성 완료 또는 `GENERATION_TIMEOUT` 뒤 재시도하도록 한다. Generation에 CANCELLED 상태는 추가하지 않는다.

- 만료 Scheduler는 처리 중인 Generation을 먼저 Timeout 등으로 종결시킨 뒤 Draft를 종료한다. Finalize Service도 Draft 잠금 아래 PROCESSING 존재 여부를 다시 확인한다.

### S3/DB 불일치 복구

- 원본 S3 업로드 성공 후 Draft INSERT 실패 → 업로드 객체 보상 삭제.

- 후보 S3 업로드 성공 후 Generation 성공 기록 실패 → 해당 객체 보상 삭제 또는 정리 대상으로 분류.

- 영구 S3 복사 성공 후 Jar/Design/Draft DB 롤백 → 그 요청의 영구 객체만 보상 삭제.

- 강제 종료로 보상 코드가 실행되지 않을 수 있다. **DB 참조와 S3 임시 Key를 대조하는 후속 정리**를 구현한다. 임시 파일도 업로드/복사 진행 중인 요청과 충돌하지 않도록 안전한 유예 기간과 상태 재검증이 필요하다. 영구 영역은 단순 경과시간만으로 삭제하지 말 것. 참조 없는 영구 객체도 별도 대조/복구 절차 없이 삭제하지 않는다.

- **정리 대상 판단은 삭제 직전 다시 검증한다.** 삭제 후보 Key가 최종 `jar_designs.final_s3_key` 등 다른 유효한 참조와 공유되지 않는지도 확인한다. 다른 요청이 원본을 읽거나 선택한 후보를 영구 영역으로 복사 중일 수 있으므로, S3 목록 조회 시점의 DB 상태만으로 즉시 삭제하지 않는다. 단, 삭제 직전의 상태 조회만으로는 조회 직후 시작하는 복사와 삭제의 경합까지 막을 수 없다. 복사 중인 객체를 정리하지 않도록 잠금/작업 상태 조정, 안전한 유예 기간 등 **실제 보호 방식은 구현 전에 결정·시험한다**. S3 호출을 기다리며 DB 행 잠금을 장시간 유지하는 방식은 사용하지 않는다. `generated_s3_key`를 남겨둔 채 후보를 지웠으면 삭제 성공 확인 뒤 해당 Generation의 `s3_deleted_at`을 기록한다.

- 원본 정리는 V33의 `original_s3_deleted_at`으로 추적한다. S3 삭제는 DB 트랜잭션 밖에서 실행하고, 성공 뒤 Draft를 다시 잠근 뒤에만 이 시각을 기록한다.

- **S3 Lifecycle/자동 정리 규칙:** 임시 경로에만 설정한 만료 규칙이 최종 영구 이미지 경로까지 포함하지 않는지 실제 Bucket 설정을 확인한다. 정리 대상을 식별할 때는 서버가 부여한 Key 접두어를 신뢰하되, 접두어만으로 사용자 소유권 또는 DB 참조 여부를 대체하지 않는다.

- **최종 Jar soft delete 시 영구 이미지 처리:** DB의 FK CASCADE나 임시 파일 정리 규칙으로 영구 S3 파일이 자동 삭제되지 않는다. Jar 복구 가능성·열람 정책·회원 탈퇴/물리 삭제 요건을 확인한 뒤 별도 보존/삭제 규칙을 정한다. 이 문서만 보고 soft delete 시 `final_s3_key` 객체를 즉시 삭제하지 말 것.

- **이미지 파일 검증과 이미지 내용의 유해성 심사는 별개다.** 사용자 원본을 콘텐츠 검사하여 부적절하면 AI 변환과 ORIGINAL 최종 사용을 막는다는 요구사항은 이미 제시됐다. 다만 심사 도구·구체적 판정 범위·오탐 및 검사 실패 시 처리·AI 결과에 대한 추가 심사 방식은 아직 결정되지 않았다. PNG 디코딩만으로 콘텐츠 검사를 완료했다고 간주하지 말 것.

## 10. 화면과 보존 정책 [확정]

- Draft 후보: **검증을 통과하고 실제 S3에서 이용 가능한 ACTIVE Draft의 원본**은 AI 생성 여부와 관계없이 선택 가능하다. 검사에 실패했거나 정리된 원본을 무조건 선택 가능하다고 표시하지 않는다. 각 AI 시도는 새 Generation으로 축적하며, 사용자용 후보 보관함에는 유효한 Draft에서 사용 가능한 후보만 최종화 전까지 표시한다.

- FINALIZED/ABANDONED/EXPIRED 후 임시 원본·AI 후보는 정리 대상이다. 생성 DB 이력은 유지한다.

- JarDesign이 없으면 기존 Theme/CSS Jar, 있으면 권한 확인된 최종 이미지+Slot Overlay로 렌더링한다. **JarDesign 행은 있는데 `final_s3_key` 객체가 누락되거나 읽기에 실패했다면 이를 DEFAULT Jar로 오인하지 않는다.** 접근 오류와 영구 파일 정합성 문제를 구분하여 실패/복구 경로를 제공한다. 목록·상세·확대·오픈 화면의 기존 파티클/버튼/온보딩/오픈 연출은 보존한다.

- Slot 좌표는 화면 부모 컨테이너가 아니라 **실제 렌더된 이미지 영역** 기준으로 적용한다. Slot 폭·높이를 감안해 경계를 넘지 않도록 검사한다.

- `slot_size_ratio`는 슬라이더 위치다. 23번에서 실제 너비를 `이미지 너비 × (0.12 + 0.16 × ratio)`, 높이를 `너비 / 3.5`로 확정했다. **기존 Jar 렌더링 공식은 유지**하고 새 정책이 필요하면 버전 구분 방법을 별도 논의한다. 기존 DECIMAL(6,5) 3개 컬럼을 그대로 사용하며 이번 작업에는 Migration이 없다.
- Slot Editor는 편집 대상 종류·Generation ID도 저장 요청에 보낸다. Service는 Draft 잠금 아래 현재 선택과 비교하고, 다른 후보로 바뀌었으면 `DRAFT_SLOT_TARGET_CHANGED`로 거절한다. 기존 세 필드 요청도 호환되지만 대상 비교 보호는 새 필드가 있는 요청에만 적용된다.

- Draft 원본/후보의 조회 권한은 Draft OWNER로 한정하고, 최종 영구 이미지는 **기존 Jar의 열람 정책**을 따른다. PreSigned GET URL은 권한 확인 후 짧게 발급하지만 이미 발급한 URL의 즉시 철회까지 보장하지 않는다.

## 11. Flyway 구현 순서와 검증 체크리스트 [다음 작업]

1. 최신 프로젝트의 실제 `users` PK, `jars.jar_id` 타입·인덱스·soft-delete 방식, 최근 Flyway 번호를 확인한다. 오래된 ERD 초안의 `users.user_id` 표기를 그대로 신뢰하지 않는다. **FK 양쪽의 정수형 크기·SIGNED/UNSIGNED**, 저장 엔진/문자셋/콜레이션과 신규 `DATETIME(6)`의 시간 기준(UTC/KST)도 기존 코드에 맞춰 확인한다.

2. `jar_design_drafts` 생성: `selected_generation_id` 컬럼은 두되 아직 Generation FK는 추가하지 않는다.

3. `jar_ai_generations` 생성 및 Draft FK와 복합 UNIQUE 설정.

4. Draft의 `(selected_generation_id,draft_id)` 복합 FK 추가.

5. `jar_designs` 생성 및 Jar/Generation FK 설정.

6. CHECK에 NULL/잘못된 상태 조합/값 범위 테스트(특히 **ACTIVE+DEFAULT/미선택+Slot 값 금지**), 복합 FK 타 Draft 거절 테스트, INDEX 중복 및 순환 FK 물리 삭제 테스트를 수행한다.

7. 생성/최종화와 S3 정리 경합(복사 중 객체 보호 방식 포함), 재요청 멱등성, **원본 콘텐츠 검사 구현 방식과 AI 결과 검사 범위**, 원본 S3 객체 덮어쓰기 방지, PIXEL 두 이미지 입력의 실제 Cloudflare API 호환성, AI 결과 이미지 검증 기준, 회원 삭제·보존 요구, soft delete된 Jar의 최종 이미지 보존 정책은 실제 구현 계획에서 별도로 결정한다. 원본의 부적절 콘텐츠를 차단한다는 기존 요구 자체를 미결정으로 되돌리지 않는다.

8. MariaDB의 `CREATE TABLE`/`ALTER TABLE` 같은 DDL은 일반 DML처럼 하나의 트랜잭션으로 전체 롤백된다고 가정하지 않는다. Flyway migration 도중 중간 단계에서 실패했을 때 남는 테이블·FK와 `flyway_schema_history` 상태를 비운영 DB에서 확인하고, 임의의 운영 DB 수동 삭제·`repair` 전에 안전한 복구 절차를 정한다.

9. 기존 migration은 수정하지 않는다. 정확한 새 버전 번호는 최신 파일 목록 확인 뒤 결정한다.

### 반드시 확인할 테스트

- 기본 Jar는 **새 AI 디자인 테이블에 행을 만들지 않음**; 기존 Jar 생성의 OWNER 멤버십 등 원래 수행되는 작업은 정상 생성됨.

- 커스텀/DEFAULT 최종화에서 실제 Jar OWNER와 Draft OWNER가 일치하며, 기존 Jar 생성이 부분 COMMIT 없이 함께 롤백됨.

- ORIGINAL/AI/DEFAULT 최종화의 Draft/Design 상태가 정확함.

- FINALIZED + 선택 없음 / DEFAULT + Slot / 타 Draft Generation / FAILED Generation은 거절됨.

- 원본 콘텐츠 검사를 통과하지 못하면 AI 변환과 ORIGINAL 최종화가 모두 거절됨. 검사 도구가 정상 동작하지 않을 때의 정책도 확정 후 테스트함. 원본 검사가 미완료인데도 통과한 것처럼 후보 목록·최종화에서 처리하지 않음.

- FINALIZED+ORIGINAL/AI에는 동일 Jar의 JarDesign 1행이 있고, FINALIZED+DEFAULT에는 JarDesign이 없으며 Design 종류가 Draft 최종 선택과 일치함. AI는 양쪽의 selected_generation_id도 동일함.

- 동시 생성 두 번, 동시 최종화 두 번, AI 완료와 만료·취소·최종화 경합에서 상태가 일관됨.

- Timeout 후 늦은 결과가 FAILED를 SUCCEEDED로 되돌리지 않음.

- 응답 유실 후 최종화 재요청으로 Jar 중복 생성되지 않음. 재요청이 서로 다른 디자인/Slot/생성 정보라면 덮어쓰지 않고 충돌 처리함.

- Finalize S3 복사 중 후보/Slot 선택이 바뀌면 잘못된 복사본으로 확정되지 않음.

- ACTIVE+DEFAULT 또는 미선택 Draft에 Slot 값이 남아 있으면 거절됨.

- S3 업로드·복사 성공 후 DB 실패/프로세스 종료에도 불필요한 객체 정리가 가능함. 정리 작업과 정상 원본 로드·후보 복사가 겹쳐도 사용 중인 객체가 삭제되지 않음.

- 같은 S3 Key 재사용·기존 객체 덮어쓰기를 방지하고, 콘텐츠 검사에 통과한 원본과 실제 AI 입력/ORIGINAL 영구 복사의 원본이 같은 객체임을 확인하며, 임시 경로의 Lifecycle 규칙이 영구 이미지까지 지우지 않음.
- PIXEL의 두 이미지 입력이 실제 Cloudflare API에서 지원되는지 확인하고, 잘못된 응답·손상 이미지·허용 크기 초과는 SUCCEEDED로 기록하지 않음.
- JarDesign이 존재하지만 영구 이미지가 누락된 경우 이를 DEFAULT Jar로 잘못 표시하지 않고, 오류 및 복구 대상으로 구분함.

- 기존 Jar 조회·soft delete·커스텀 디자인 렌더링과 Slot 위치/크기가 유지됨. Soft delete 이후 영구 이미지가 임시 정리 작업으로 삭제되지 않음.

- 프론트가 임의의 S3 Key·타인 Draft/Generation ID를 제출해도 접근/선택/최종화가 거부됨.

- 원본 콘텐츠 심사가 미완료인 경우 승인된 ACTIVE Draft로 사용하거나 ORIGINAL/AI 최종화로 우회할 수 없음.

- Flyway DDL 중간 실패를 비운영 DB에서 재현하고 남은 객체·스키마 이력·복구 절차를 검증함.

## 12. 의도적으로 제거한 구 설계

`jars.active_ai_generation_id`, `jar_ai_generations.jar_id`, `created_by`, `source_upload_id`, `generated_url`, `jar_designs.DEFAULT`, Jar 생성 후 `apply/revert` API, 모든 스타일의 공통 Reference, JarTheme 강제 recolor, AI가 직접 그리는 동전 투입구, v1의 사용자별 고정 생성 횟수 제한은 사용하지 않는다.

---

**현재 진행 위치:** 3번 **논리 ERD·테이블 계약** 정리. 다음 4번에서 최신 소스와 MariaDB를 기준으로 **실행 가능한 FK / CHECK / INDEX SQL을 검증**한다. 이 문서에 남긴 ‘미결정/검증’ 항목을 Codex가 임의로 확정하지 말 것. 이번 보완은 테이블/컬럼을 늘리지 않았다. Flyway 및 운영 API 호환성을 실제 실행·검증했다고 주장하지 않는다.
