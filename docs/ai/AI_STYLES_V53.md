# 생성 화면·보관함 개선과 AI 스타일 3종 추가

기준: 2026-10-22, 로컬 프로젝트 `C:/Users/whdgu/Desktop/graduation`.
기존 생성 방식·Draft(저금통을 만들기 전 임시 디자인)·권한·이미지 심사·개인 S3 저장 정책은 유지한다.

## 요청에 맞춘 변경

1. 생성 선택 화면: 큰 이모지 대신 실제 커스텀 저금통 렌더러와 기존 기본 테마 아이콘을 활용한 예시, 두 제작 방식의 차이, 설명·특징·진입 버튼을 정돈했다. 기본 테마가 사진 창이나 커스텀 본체를 제공하는 것처럼 표현하지 않는다. 기존 `/jars/design/new`, `/jars/new?mode=default` 경로와 기본 테마 생성·온보딩은 그대로다.
2. 제작 단계: 현재는 진한 보라색+흰 글자+‘현재 단계’, 완료는 초록 체크, 예정은 중립색으로 구분한다. 사진/AI, 입구/배경, 이름 입력의 실제 편집 위치에 따라 3→4→5 표시가 바뀐다. 순서를 임의 변경하거나 미래 단계를 완료로 저장하지 않는다. 이 표시는 진행 안내이지 서버 저장 완료 증명이 아니다.
3. 스타일: 기존 6종 뒤에 아래 3종을 추가한다. 사용자가 제외한 종이 콜라주·자수·스테인드글라스는 코드와 웹 자산에 넣지 않았다.
4. 보관함: 가로로 길던 카드를 PC 3열·태블릿 2열·모바일 1열로 변경한다. 한 페이지 9개, 상단 실제 디자인·상태, 제목·설명·인원·역할·날짜·열어보기를 표시한다. 기존 기본/커스텀 디자인, 빈 목록·로딩·오류·페이지 이동·온보딩을 유지한다. 작은 진행선은 기존의 대략적인 오픈 시점 표현이며 실제 정밀 퍼센트가 아니다.

현재 User/목록 DTO에는 참여자 얼굴 사진이 없다. 인원수에 맞춘 중립 사람 아이콘을 쓰며 가짜 얼굴·닉네임은 만들지 않는다. 카드별 멤버 API를 호출하지 않는다. 목록 DTO 필드 및 서버 배치 조회는 변경하지 않았다. 이미지가 없는 커스텀 디자인은 오류 안내를 유지하고 기본 디자인으로 속이지 않는다.

## 새 스타일 계약

| ID / 화면 이름 | 표현 | 새 프롬프트 버전 |
| --- | --- | --- |
| NEON_DRAWING / 네온 드로잉 | 빛나는 윤곽선과 작은 광원 번짐 | BASE_V3+NEON_DRAWING_V1 |
| CHROME_MIRROR / 크롬 미러 | 원본 색을 유지하는 금속 반사·선명한 하이라이트 | BASE_V3+CHROME_MIRROR_V1 |
| RISO_PRINT / 리소 프린트 | 색 겹침·망점(작은 인쇄 점)·미세한 인쇄 어긋남 | BASE_V3+RISO_PRINT_V1 |

세 스타일은 새로운 대상·얼굴·글자·투입구·장소를 발명하지 않는다. 기존 장면은 같은 스타일로 함께 변환하고, 배경 없는 원본과 흰 여백은 흰색으로 유지한다. 금속 반사를 위해 새 풍경을 그리지 않고, 리소 효과로 대상을 복제하지 않는다. 네온 예시는 어두운 배경을 사용하지만 실제 생성은 기존 BASE_V3 배경 정책을 우선한다. 입체감은 이미지 표현일 뿐 실제 3D 모델 생성이 아니다.

## 저장·배포 순서

- V52를 고치지 않고 `V53__add_distinct_ai_styles.sql`을 추가했다.
- 기존 `chk_jar_ai_generations_ai_style`, `chk_jar_ai_generations_pixel_versions`만 확장한다.
- 새 스타일의 reference/postprocess 버전은 NULL이다. PIXEL의 비어 있지 않은 후처리 버전·선택적 참조 버전 제약은 유지한다.
- 백엔드 V53 적용 후 프론트엔드를 배포한다. 프론트부터 배포하면 구 서버는 새 스타일 요청을 거절한다.
- 새 스타일 데이터가 생긴 뒤 구 서버로 롤백하면 enum 읽기 호환성을 검토해야 한다. 기존 데이터나 적용된 Migration을 지워서 해결하지 않는다.
- 이 작업에서 운영 DB Migration·배포·실제 Cloudflare 생성 호출은 실행하지 않았다.

## 예시 이미지와 생성 프롬프트

Built-in image generation을 사용해 각 스타일을 별도 호출로 생성했다. 실제 서비스의 Cloudflare 출력 검증 자료가 아니라 선택 도움용 예시다. 기존 6개 이미지는 교체하지 않았다. 원본은 생성 도구 저장 위치에 보존하고 sharp로 320×320, quality 70 WebP 사본을 만들었다.

최종 자산:

- `frontend/public/images/ai-styles/neon-drawing.webp` — 7,432 bytes
- `frontend/public/images/ai-styles/chrome-mirror.webp` — 9,748 bytes
- `frontend/public/images/ai-styles/riso-print.webp` — 8,356 bytes

공통 이미지 생성 지시:

> Use case: stylized-concept. Asset type: square preview illustration for an AI style selection card, not a UI mockup. Subject: exactly one coral-pink five-petaled flower, yellow center, gently curved green stem, two green leaves, and one simple orange terracotta flowerpot. Entire subject centered uncropped with 12% margins. Preserve those shapes and colors. No face, text, logo, watermark or extra objects.

네온 추가 지시:

> Style/medium: NEON LINE ART. Beautiful sharply drawn luminous pink contour tubes outline the petals; yellow glowing center; emerald neon contours describe leaves and stem; amber-orange contour light outlines the flowerpot. Predominantly delicate light linework with dark interiors, realistic restrained bloom around the same outlines. Deep ink-blue plain background for this style sample. Distinctive futuristic light drawing, NOT a colored solid 3D flower, no filled cartoon, no glass mosaic, no paper, no embroidery.

크롬 추가 지시:

> Style/medium: TINTED MIRROR CHROME illustration. Polished mirror-metal surfaces with crisp elongated white specular reflections, deep dark reflection bands and razor-clean highlights. Pink-tinted chrome petals, golden-yellow metal center, green chrome stem/leaves, copper-orange polished pot. The colors and silhouette remain clearly readable. Light warm ivory background. High fashion metallic sculptural illustration, not matte soft clay, no extra pedestal, no room scenery, no new objects.

리소 추가 지시:

> Style/medium: RISOGRAPH ART PRINT. Distinctive flat overlapping coral-pink, yellow, green and orange soy-ink shapes, pronounced halftone dot screen and tiny coarse ink grain, slight tasteful off-register color edges and overprint intersections. Simplify exactly the same subject into bold planar printed shapes. Warm ivory uncoated-paper background. Not pencil strokes, not watercolor washes, not hand-cut paper layers, no 3D shadows, no black cartoon outlines, no rectangular poster frame.

## 검증 구분

- 프론트 Node 테스트: 스타일 ID·순서·9개 설명·경량 자산과 기존 제작 단계 규칙.
- 백엔드 단위 테스트: 버전·스타일별 프롬프트·원본 보존·배경·참조/후처리·생성 저장 파이프라인. 외부 AI/S3는 대역이다.
- 브라우저: `frontend/tests/creation-shelf.browser.cjs`. 실제 React에서 두 진입 경로, 현재 단계, 3개 새 스타일 요청, 9개 카드, 페이지 이동, 빈 목록/오류, 1440·768·390·320px 가로 넘침을 확인한다. 외부 API와 소켓은 대역이며 운영 통신을 차단한다. PNG는 `build/creation-shelf/`에 저장한다.
- 프론트 `vite build`, 백엔드 `bootJar`를 별도 확인한다.
- 실제 MariaDB 10.11 V52→V53 시험은 임시 Docker 컨테이너에서 실행해 통과했다. 기존 후보·버전·이미지 키 보존, 새 3종 저장, 잘못된 스타일/참조/후처리 거절, 기존 PIXEL 버전 제약을 확인했다. 운영 DB는 사용하지 않았다.
- 프론트 전체 Node 테스트 **217건 통과**, 백엔드 관련 테스트 **80건 통과**(위 MariaDB 업그레이드 시험 1건 포함). 실패/오류/건너뜀은 0건이다. 전체 백엔드 테스트 실행을 의미하지 않는다.
- V53 시험의 첫 실행 실패는 샘플 완료 시각에 초 단위 `NOW()`를 사용해 마이크로초 단위 생성 시각보다 앞서는 문제였다. 샘플 데이터에 같은 `NOW(6)`을 기록하도록 수정했다. 운영 제약을 완화하지 않았다. 프론트의 이전 280px 가로형 카드 검증도 요청한 230px 카드형 영역 기준으로 갱신했다.
- 실제 새 스타일의 생성 품질·원본 배경 보존, 운영 계정·DB·S3 연동 및 배포 후 화면은 별도 확인이 필요하다.

## 주요 수정 파일

- `frontend/src/features/jarDesign/components/CreationChoices.jsx`, `jarCreation.css`: 두 제작 방식의 선택 화면과 반응형·키보드 포커스·움직임 줄이기 설정.
- `frontend/src/features/jarDesign/components/DesignProgress.jsx`, `frontend/src/pages/JarDesignNewPage.jsx`, `AiCandidateGallery.jsx`: 단계 표시와 편집 위치 연결.
- `frontend/src/pages/JarsPage.jsx`, `frontend/src/features/jarDesign/jarShelf.css`: 목록 카드와 9개 단위 페이지 이동. 카드별 API 호출이나 얼굴 사진 조회는 추가하지 않는다.
- `frontend/src/features/jarDesign/aiStylePreviews.mjs`, `AiStylePicker.jsx`, `frontend/src/features/support/supportView.mjs`: 9개 스타일과 문의 화면 이름.
- `src/main/java/shop/esjh/memoryjar/enums/ai/JarAiStyle.java`, `service/ai/AiPromptCatalog.java`, 신규 프롬프트 3개, `V53__add_distinct_ai_styles.sql`: 실제 요청과 저장 계약.
- 프론트 자산/제작 순서/표시 크기 테스트, `frontend/tests/creation-shelf.browser.cjs`, `AiPromptCatalogTest`, `JarAiGenerationServiceTest`, `AiStylesV53MigrationTest`: 동작 회귀 검증.
- `docs/API.md`, `docs/DTO.md`, `AI_DESIGN_PLAN.md`, `AI_DESIGN_RULES.md`, `AI_ERD.md`, `AI_STYLE_PREVIEW_ASSETS.md`, 이 문서: 새 스타일 계약·배포 순서·검증 범위.

새 라이브러리·API 필드·권한 우회·실제 AI 자동 요청은 추가하지 않았다. 기존 미커밋 부하 시험 파일은 이 작업에서 변경하지 않았다.
