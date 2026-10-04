# V43 상상의 작은 문 — 2026-10-04

> 2026-10-04 V44 증분: 화면 입구 9개 컬렉션×12개(108종), 호환 ID 포함 서버 120종. sizeRatio는 -0.5~1로 확장하되 이전 0~1 기하는 유지한다. Draft에 nullable aiInputPhotoFrame을 추가하여 저장한 원본 장면으로 AI 입력을 만들며 원본/S3는 보존한다. V44 백엔드·DB를 먼저 배포한다. [모바일·사진 배치·입구 변경 계약](AI_MOBILE_COMPOSITION_V44.md)이 이번 증분 기준이며 아래 V43 이전 설명은 당시 기록이다.

## 현재 구현과 변경 이유

- 선택 화면은 정확히 24종: 클래식 8종(CAPSULE, RECTANGLE, OVAL, METAL, WOOD, PIXEL, BRASS, ROSE_GOLD) + 자유형 16종이다. 기존 가로 슬롯을 같은 모양의 테두리로만 꾸미지 않고 구멍 자체를 다르게 만든다.
- 꽃과 자연: BLOSSOM_GATE(벚꽃), HEART_GATE(하트), PAW_GATE(발도장), BUTTERFLY_GATE(나비), LEAF_GATE(잎), SHELL_GATE(조개), DROP_GATE(물방울), CLOUD_GATE(구름).
- 상상의 문: STAR_GATE(별), MOON_GATE(초승달), CRYSTAL_GATE(보석), PLANET_GATE(토성), RIBBON_GATE(리본), KEY_GATE(열쇠구멍), SUN_GATE(햇살), SNOWFLAKE_GATE(눈꽃).
- `slotCatalog.mjs`의 FREEFORM_SLOT_CATALOG와 `components/FreeformSlotArtwork.jsx`가 도면·재질·내부 실루엣·도착 지점을 관리한다. 새 SVG는 고유한 useId로 참조를 격리하며 생성 API나 새 라이브러리가 없다. 선택/표시 컴포넌트는 같은 렌더러를 재사용한다.
- 예전 24종은 LEGACY_SLOT_CATALOG에 ID·도면·재질·3.5:1 공식을 그대로 보존한다. 그중 16종은 새 선택 목록에서만 빠지고 저장 데이터 렌더링과 API에서는 여전히 유효하다. 저장 ID를 재사용해 기존 저금통의 모습을 바꾸지 않는다.
- 새 자유형 16종은 정사각 100×100 도면이며 너비와 높이가 각각 이미지의 `(0.12 + 0.16 × sizeRatio)`다. 기존 24종은 높이가 너비/3.5다. 모양 전환·드래그·키보드·슬라이더에서 소수 다섯 자리 양자화 후 전체 경계를 검사하고 필요한 경우에만 안쪽으로 보정한다.
- 외곽 중심은 기존 centerX/centerY에 저장한다. 쪽지 목표는 모양별 실제 구멍 내부의 안전 영역이다. 초승달처럼 중앙이 빈 모양은 내부 목표점으로 보낸다. 기존 입구의 목표와 애니메이션 코드는 유지한다.
- `JarSlotGeometry`는 저장과 Finalize 모두 실제 스타일의 높이로 검사한다. 구 클라이언트가 slotStyle을 생략해도 저장된 스타일로 검사한다. 인증·OWNER/ACTIVE·선택 Snapshot·잠금·중복 클릭·외부 I/O의 트랜잭션 경계는 유지한다.

## V43 DB·API·배포

- API 필드·컬럼·기본값·기존 행은 바꾸지 않는다. V43은 Draft/Design의 두 slot_style CHECK에 자유형 16개 ID를 추가한다. 서버/DB 허용값은 호환 ID 포함 40개이며 화면 선택지는 24개다. V35~V42 Migration은 수정하지 않는다.
- `V43__add_freeform_jar_slots.sql`과 확장 enum/경계 검증을 포함한 백엔드를 먼저 배포하고 Flyway 성공 후 프론트를 배포한다. 새 ID가 저장된 뒤 이전 enum 백엔드 단독 롤백은 안전하지 않다. 구 프론트의 CAPSULE fallback도 시각적 호환성을 보장하지 않는다.
- 이번 작업은 로컬 코드·격리 MariaDB·메모리 UI 검증이며 운영 적용을 주장하지 않는다.

## V43 검증 기록

- 관련 백엔드 311개 통과(실제 MariaDB V42→V43/V41→V42/V35, 40종 HTTP/JPA/Finalize, 높이 경계 및 스타일 생략 입력 포함), bootJar 성공.
- 브라우저 SVG 엔진에서 자유형 16종의 외곽 경계 및 실제 구멍 내부 목표 영역 9점씩 전부 통과했다.
- 실제 FlyingNote를 PC/320px에서 24종 각각 재생해 목표와 도착 중심의 최대 오차가 0.00005px 미만이었다. 운영 쪽지는 저장하지 않았다.
- 프론트 회귀 69개 통과, Vite build 성공. 기존 500kB 초과 번들 경고와 백엔드 deprecated API 경고는 남아 있다.
- 320px 실제 편집 화면은 clientWidth/scrollWidth=305/305로 가로 넘침이 없다. 벚꽃 선택·키보드 이동·저장·화면 새로고침·5초 생성 연출·최종 생성에서 BLOSSOM_GATE와 CAT 본체, CONTAIN 사진 배치가 유지됐다. 저장된 좌표는 가로 51%/세로 29.4%, 크기 슬라이더 22%다. 기존 황동 y=4%에서 큰 꽃으로 바꿀 때 y=14%로 안쪽 보정되는 것도 확인했다.
- 실제 휴대폰·운영 V43 적용 및 배포 후 확인은 별도다.

## 변경 파일

- 프론트: `slotCatalog.mjs`, `slotCatalog.test.mjs`, `slotGeometry.mjs`, `components/FreeformSlotArtwork.jsx`, `components/JarSlotOverlay.jsx`, `components/SlotEditor.jsx`.
- 백엔드: `enums/ai/JarSlotStyle.java`, `service/ai/JarSlotGeometry.java`, `service/ai/JarDesignDraftService.java`, `service/ai/JarDesignFinalizePersistenceService.java`, V43 Migration.
- 회귀: `migration/JarFreeformSlotV43MigrationTest.java`, V42 역사 계약 테스트, Slot 경계·Draft 저장·Finalize 테스트, `frontend/tests/jar-body-preview.jsx`.
- API/DTO/ERD/AI_ERD/AI_DESIGN_PLAN/AI_DESIGN_RULES의 V43 보충도 함께 대조한다.

# V42 입구 공방 — 당시 구현·검증 기록

## 당시 구현 (V43에서 새 선택 목록·자유형 기하를 변경함)

- 기존 6종(CAPSULE, RECTANGLE, OVAL, METAL, WOOD, PIXEL)은 이름·CSS·기본값을 그대로 유지한다.
- 공방 재질: BRASS(앤티크 황동), ROSE_GOLD, OBSIDIAN(흑요석), PEARL, PORCELAIN(청화 도자기), LEATHER.
- 작은 자연: LEAF, BAMBOO, BLOSSOM, PAW, SHELL, RIPPLE.
- 꿈과 장식: STARLIGHT, MOONLIGHT, AURORA, CRYSTAL, RIBBON, KEYHOLE.
- `slotCatalog.mjs`가 24종 이름·설명·분류·도면·팔레트의 기준이다. `slotGeometry.mjs`의 기존 SLOT_STYLES export도 유지한다.
- `DecorativeSlotArtwork.jsx`는 새 18종의 재질·개별 세공을 SVG로 그린다. 여러 미리보기를 동시에 표시할 때도 React useId로 그라디언트/클리핑 ID를 격리한다. 기존 여섯 입구는 공유 `JarSlotOverlay.jsx`의 기존 CSS로 렌더링한다.
- 입구 장식은 전체 3.5:1 경계 안에 있고 구멍 중심은 정확히 중앙이다. 위치·크기·소수점 양자화·쪽지 투입 목표 공식은 바꾸지 않는다. PNG/AI 입력에도 합성하지 않는다.
- 편집기에서 기본/공방 재질/작은 자연/꿈과 장식/전체로 둘러본다. 선택한 입구의 큰 샘플·설명은 항상 보이며 분류를 바꿔도 선택·위치·크기를 유지한다. 미저장 편집은 기존 저장 버튼으로만 서버에 보낸다.
- 컬렉션은 로컬 필터이므로 추가 API·DB 조회·유료 AI 요청·새 라이브러리가 없다. 인증·CSRF·OWNER/ACTIVE·현재 이미지 Snapshot·중복 클릭·최종화 경합 보호도 기존 구현을 사용한다.

## DB와 배포 호환성

- `JarSlotStyle` enum을 확장하고 V42가 두 테이블의 `chk_draft_slot_style`/`chk_design_slot_style`만 확장한다. VARCHAR(20)·NOT NULL·CAPSULE 기본값·기존 좌표·사진·본체는 변경하지 않는다. V35 등 적용된 마이그레이션은 수정하지 않는다.
- API 필드와 응답 형태는 그대로다. slotStyle 생략 시 Service는 저장된 종류를 유지한다. 클라이언트의 누락/미지원 렌더링 값은 기존 CAPSULE fallback을 유지하지만 서버/DB는 미지원 문자열을 거절한다.
- V41 동물 추가와 함께 배포할 경우 V41/V42와 확장 enum을 포함한 백엔드를 먼저 배포하고 Flyway 성공을 확인한 뒤 프론트를 배포한다.
- 구 서버는 새 입구 문자열을 읽거나 저장할 수 없다. 새 ID가 저장된 이후 구 enum 서버로의 단독 롤백은 안전하지 않다. 구 프론트는 새 종류를 CAPSULE로 표시하므로 시각적 호환성도 별도 검토한다.
- 운영 배포·운영 DB 적용은 이번 로컬 검증과 구분한다.

## 검증 결과

- 프론트 Node 회귀 67개 통과. 24종 고유성·프론트/Java/V42 일치·분류·NULL fallback·저장 복원·좌표 경계·쪽지 목표를 포함한다.
- 관련 백엔드 회귀 220개 통과. 격리 MariaDB V41→V42 데이터 보존과 허용/미지원/NULL 제약, V35 회귀, 24종 HTTP 입력/JPA 저장·재조회/최종화 복사를 포함한다. 기존 인증/권한/선택 변경/경합 회귀도 통과했다.
- 프론트 Vite build와 bootJar 성공. 기존 500kB 초과 프론트 번들 경고와 백엔드 deprecated API 경고는 남아 있다.
- 로컬 브라우저에서 밝은/어두운 바탕과 70px 작은 표시를 비교했다. 24개 카드, 새 SVG 54개(각 3회 표시)의 108개 그라디언트 ID가 모두 고유하고 누락된 fill 참조는 0개였다.
- 320px 모바일 clientWidth/scrollWidth=305/305로 가로 넘침이 없다. 분류 변경 후 PAW 선택을 유지하고 저장/새로고침/최종 생성까지 PAW·가로 50.1%·CONTAIN 사진 배치가 그대로 유지됐다.
- 실제 FlyingNote를 로컬 도착 고정 모드로 재생해 24종 입구 중심과 쪽지 중심을 비교했다. 가로 오차 0px, 세로 최대 오차 약 0.000007px였다. 운영 쪽지를 저장한 검증은 아니다.
- 실제 휴대폰·운영 V42 적용 및 배포 후 동일 흐름 확인은 별도 작업이다.

## 관련 변경 파일

- 프론트: `frontend/src/features/jarDesign/slotCatalog.mjs`, `slotCatalog.test.mjs`, `slotGeometry.mjs`, `components/DecorativeSlotArtwork.jsx`, `components/JarSlotOverlay.jsx`, `components/SlotEditor.jsx`.
- 백엔드: `src/main/java/shop/esjh/memoryjar/enums/ai/JarSlotStyle.java`, `src/main/resources/db/migration/V42__expand_jar_slot_styles.sql`.
- 회귀: `src/test/java/shop/esjh/memoryjar/migration/JarSlotStyleV42MigrationTest.java`, `controller/ai/JarDesignDraftControllerTest.java`, `repository/ai/JarPhotoFrameRepositoryTest.java`, `service/ai/JarDesignFinalizePersistenceServiceTest.java`.
- 로컬 UI: `frontend/tests/jar-body-preview.jsx`, `frontend/tests/note-drop-preview.jsx`. DEV 전용 메모리 어댑터로 운영 HTTP/AI/WebSocket 요청을 하지 않는다.
