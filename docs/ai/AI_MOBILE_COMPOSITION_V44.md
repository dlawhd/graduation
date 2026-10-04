# V44 모바일 제작·사진 배치·입구 확장

## 범위와 전후 동작

현재 로컬 프로젝트 `C:/Users/whdgu/Desktop/graduation`, main의 시작 HEAD `32099f30`에서 수정했다. 운영 배포나 유료 AI 생성 검증은 하지 않았다. 기존 기본 테마, 이미지 단독 자르기, Draft 권한/잠금/선택 스냅샷, 쪽지 목표 및 생성 연출을 유지한다.

| 항목 | 이전 | 변경 후 |
|---|---|---|
| 제작 단계 스크롤 | query 단계 변경에서 이전 위치가 남음 | 본체→그림→사진 배치와 배치 적용→AI 단계의 상단 표시 |
| 모바일 파일 전송 | 원본 파일 핸들과 큰 바이트 그대로 전송 | 메모리 스냅샷, 850KiB 이하 전송, 최대 긴 변 1280px부터 등비 축소, PNG/WebP 투명도 보존 |
| 사진 조절 | 저금통 창만 드래그 가능 | 원본의 선택 영역도 터치/마우스/방향키로 이동; 창 안 드래그 유지 |
| AI 장면 | 저장한 사진 배치와 무관하게 전체 원본 전송 | 원본 선택 영역을 불변 스냅샷으로 전달하고 로컬 임시 480 PNG 생성 |
| 입구 목록 | 3개 컬렉션/24개를 한꺼번에 표시 | 9개 컬렉션 각 12개, 총 108개, 페이지당 최대 6개와 숫자/화살표 |
| 입구 연출 | 정적 장식 | 소재별 반사광·물결·세공 미세 회전; 구멍/쪽지 목표는 고정 |
| 입구 크기 | 이미지 너비 12~28% | 새 작은 구간 4~12% 추가; 기존 저장 크기는 유지 |
| 창 위 흰 선 | 공통 장식 path가 가로로 표시 | 그 공통 path만 제거; 사진 창/다른 장식 유지 |
| 기본 저금통 전환 | Draft에서 DEFAULT를 선택 | `/jars/new?mode=default` 기존 8개 테마 선택 페이지로 이동 |
| 완성 커스텀 디자인 | 목록 144px, 상세 230px | 목록 최대 240px, 상세 최대 360px, 좁은 화면은 부모 폭 안으로 축소 |

## 데이터·AI 계약

- V44는 `jar_design_drafts`에 `ai_input_x/y/width/height DECIMAL(7,6) NULL`, `ai_input_fit VARCHAR(10) NULL`을 추가한다. 조회 DTO의 nullable `aiInputPhotoFrame`은 기존 `JarPhotoFrameValue`와 같은 구조다. 새 요청 API는 없다.
- 원본에 적용한 사진 배치를 AI 입력용으로 보존한다. AI 후보 선택/후보 배치 수정은 이 값을 덮어쓰지 않으며 원본 재선택 시 원래 배치를 복원한다. 이미지 단독 전환은 값을 비운다.
- 백필은 본체가 있고 ORIGINAL을 선택한 배치만 대상으로 한다. 과거 NULL fit은 기존 의미인 COVER로 복원한다. 과거 AI 출력 배치를 원본 배치라고 추측하지 않는다. 과거 AI 선택 Draft는 원본 배치를 다시 저장하기 전 전체 원본 입력을 유지한다.
- 생성 시작의 Draft 잠금 안에서 DTO로 스냅샷을 확보하고, 원본 S3 조회 뒤 선택 영역을 잘라 임시 PNG로 변환한다. 원본 S3는 덮어쓰지 않는다. 직사각 선택은 비율대로 480×480에 흰 여백을 넣으며 늘이지 않는다. 새 DB 조회·AI 호출·참조 이미지·후처리 변경은 없다.
- 기존 AI 프롬프트·PIXEL 96×96/64색·제공자 오류 분류·심사·S3 보상 삭제를 유지한다. 실제 AI 결과가 구도/내용을 완벽하게 재현한다는 보장은 별도다.

## 입구 호환성과 성능

- 기존 24개 가로 ID와 V43 자유형 16개를 보존하고 새로운 자유형 80개를 추가한다. 화면은 클래식 12+자유형 96=108, 서버/DB는 숨겨진 이전 12개를 포함하여 120개를 허용한다.
- 너비 공식 `0.12 + 0.16 * sizeRatio`는 그대로이며 -0.5~0만 새 작은 구간이다. 기존 0 값의 12% 크기를 바꾸지 않는다. Java/JS는 스타일 높이와 양자화 경계를 함께 검증한다.
- 비대칭 도형의 쪽지 목표는 실제 구멍 안의 안전 영역이다. 모양이나 애니메이션 변경으로 저장 중심을 재해석하지 않는다.
- 목록은 로컬 필터/페이지로 처리하여 추가 요청이 없고 실제 편집기에는 6개만 마운트한다. 기존 공유 IntersectionObserver로 화면 밖/숨긴 탭의 애니메이션을 멈추며 reduced-motion을 지원한다. 새 라이브러리나 반복 타이머는 없다.

## 모바일 업로드 확인 범위

- 실제 바이트 형식·최대 10MB 사전 검증과 서버 입력/콘텐츠 검사는 유지한다. 작은 파일은 손실 없이 스냅샷만 만들고 큰 JPEG는 JPEG, PNG/WebP는 PNG로 준비한다. 전송 timeout 90초, 자동 재전송 없음, 중복 클릭 방지 유지.
- Network Error/timeout/413을 구분해 안내하고 이미 선택한 사진을 보존한다. 로컬 메모리 어댑터로 실제 File→Canvas→FormData 경로와 오류 후 수동 재시도를 검증한다.
- 실제 휴대폰의 운영 실패 원인은 아직 확정하지 않았다. 서버 Nginx 업로드 제한·CORS·모바일 브라우저 오류/네트워크 기록은 배포 후 확인한다. 압축으로 모든 Network Error가 해결된다고 주장하지 않는다.

## 수정 파일 및 위치

- 제작 이동/크기: `frontend/src/pages/JarDesignNewPage.jsx`, `JarsPage.jsx`, `features/jarDetail/components/JarVisual.jsx`.
- 사진/후보: `frontend/src/features/jarDesign/components/PhotoFrameEditor.jsx`, `AiCandidateGallery.jsx`, `CandidateComparison.jsx`, `JarBodyArtwork.jsx`, `photoFraming.mjs`.
- 업로드: `frontend/src/api/jarDesignDraftApi.js`, `frontend/src/features/jarDesign/sourceUpload.mjs`, `sourceUpload.test.mjs`.
- 입구: `frontend/src/features/jarDesign/slotCatalog.mjs`, `extraSlotCatalog.mjs`, `slotGeometry.mjs`, `slotMotion.css`, `slotCatalog.test.mjs`, `components/SlotEditor.jsx`, `JarSlotOverlay.jsx`, `FreeformSlotArtwork.jsx`.
- 서버: `entity/ai/JarDesignDraft.java`, `dto/ai/response/JarDesignDraftDetailResponse.java`, `enums/ai/JarSlotStyle.java`, `service/ai/JarDesignDraftService.java`, `JarAiGenerationPersistenceService.java`, `JarAiGenerationService.java`, `JarAiInputImageProcessor.java`, `JarSlotGeometry.java` (`src/main/java/shop/esjh/memoryjar/` 아래).
- DB: `src/main/resources/db/migration/V44__expand_slots_and_preserve_ai_input_frame.sql`. 적용된 V1~V43은 수정하지 않았다.
- 검증: V44/V43 Migration 테스트, Draft Entity/JPA/생성 서비스/입구 경계 테스트, `frontend/tests/jar-body-preview.jsx`의 DEV 전용 무외부요청 어댑터.
- 문서: API/DTO/ERD 및 AI_ERD/AI_DESIGN_PLAN/AI_DESIGN_RULES/AI_SLOT_STYLES의 V44 증분 링크. 과거 검증 기록은 보존한다.

## 배포와 남은 확인

V44 Migration·enum·AI 입력 응답을 포함한 백엔드를 먼저 배포하고 Flyway 성공을 확인한 다음 프론트를 배포한다. 새 ID/음수 크기가 저장된 이후 이전 enum/제약 서버 단독 롤백은 안전하지 않다. 운영 V44 적용·실제 휴대폰 업로드·실제 AI 결과의 조정 장면은 별도 확인이 필요하다.

## 이번 로컬 검증 결과

- Node의 jarDesign 및 noteFlightGeometry 테스트 74개 통과(실패 0). Vite 프로덕션 빌드 성공. 기존 500KB 초과 번들 경고는 남아 있다.
- V44/V43 Migration, 사진 배치 JPA, AI 생성/저장/Draft/입구, Entity, Controller의 관련 백엔드 테스트 800개 통과(실패/건너뜀 0). `bootJar` 성공. 실제 MariaDB Testcontainers에서 V43→V44 업그레이드·기존 값 보존·120개 enum·최소 입구·잘못된 값 거절을 검증했다. 전체 프로젝트 테스트 실행을 의미하지 않는다.
- PC, 390px/320px 로컬 브라우저에서 단계 상단 이동, 원본과 창 안 드래그, 기본 8개 테마 페이지 전환, 카테고리별 12개/페이지당 6개 및 선택 보존을 확인했다. 320px에서는 가로 넘침이 없었다.
- 실제 File→Canvas→FormData 경로에서 JPEG 8,174,912→822,157바이트(1280×896), PNG 7,843,549→643,916바이트(540×378)를 확인했고 PNG 투명도가 보존됐다. 강제로 발생시킨 Network Error에서 사진이 남고 수동 재시도가 성공했다. 운영 요청을 하지 않는 DEV 전용 메모리 어댑터 검증이다.
- 자유형 96개는 실제 SVG 외곽과 목표 주변 9개 지점이 구멍 안에 있는지 검사했다. 실제 FlyingNote를 도착 시점에 고정하여 PC 108개 입구 전체와 320px 모바일 대표 8개의 목표/쪽지 중심을 측정했다. 최대 차이는 PC 0.000049px, 모바일 0.000013px 미만이었다. 움직이는 장식과 달리 구멍/도착 목표는 고정이었다.
- AI 테스트는 보존된 원본 바이트와 실제 제공자 요청 입력의 선택 장면을 대조했다. 실제 유료 AI 호출이나 운영 업로드·DB 적용·Git 커밋/푸시는 수행하지 않았다.
