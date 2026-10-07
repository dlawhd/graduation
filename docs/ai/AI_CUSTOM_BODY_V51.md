# 직접 만드는 저금통 틀 — V51

## 새 사용 순서

새 저금통 → 직접 만들기 → **틀 만들기** → 그림 그리기/사진 선택 → 사진 배치 → 선택 사항인 AI 변환 → 후보 선택 → 입구와 배경 → 저금통 생성.

- 자유롭게 외곽선을 그리거나 점을 찍어 만든다. 점 이동, 방향키 편집, 되돌리기, 새로 그리기, 색상 변경을 제공한다.
- 장식 없는 둥근 틀, 병 모양 틀, 네모 틀로 시작할 수 있다.
- 마음에 들지 않으면 `준비된 저금통에서 고르기` 또는 `이미지만 사용하기`로 전환한다. Draft 업로드 전에는 그림판, 선택 사진, 직접 만든 틀을 유지한다.
- 같은 탭의 sessionStorage에는 좌표/색상만 보관한다. 사진 파일은 기존처럼 메모리에만 둔다. 저장 공간 오류는 화면 편집을 막지 않는다.
- 후보 비교, 입구 편집, 최종 미리보기, 완성 저금통은 같은 외곽선을 사용한다. 틀을 사진에 합성하지 않아 기존 AI 입력과 원본은 보존된다.
- 꽉 채우기는 틀 모양으로 사진을 자른다. 전체 보기는 오목한 틀에서도 사진이 잘리지 않도록 틀 내부의 안전한 사각형에 등비 표시한다.
- 이번 구현은 **2D 외곽선**이다. 입체 모델과 드래그 회전은 구현하지 않았다.

## 선택 목록 정리

새 목록은 50종에서 28종으로 줄인다. 유리와 도자기 7종, 작은 보석 7종, 꿈꾸는 오브제 6종, 작은 버섯집(MUSHROOM), 피어나는 마음(FLOWER)을 제외한다.

과거 50종의 ID와 렌더링 정의는 유지한다. 이미 생성한 저금통과 저장된 Draft를 삭제하지 않는다. 기존 Draft의 제거된 외형은 현재 선택으로 읽을 수 있지만 새 선택 목록에는 노출하지 않는다.

## 저장 계약과 보안

- `JarBodyStyle.CUSTOM`과 `customBody: {points: [{x,y}, ...], color}`를 추가한다.
- 기존 multipart의 `image`, `bodyStyle`에 선택 사항인 JSON part `customBody`를 추가한다. CUSTOM일 때만 필수다.
- 좌표 0.05~0.95, 꼭짓점 3~96개, 색상 `#RRGGBB`를 제한한다. 교차 선, 중복 점, 작은 틀, 무한/비정상 좌표는 프론트와 서버에서 거절한다.
- 임의 SVG, HTML, URL이 아니라 숫자와 색상만 저장한다. 서버 검증은 DB 생성/심사/S3 호출보다 먼저 수행한다.
- 좌표를 방어적으로 복사한다. 최종화는 외곽선까지 스냅샷에 포함해 중간 변경을 검출한다.
- V51은 Draft와 영구 Design에 nullable `custom_body_json TEXT`를 추가한다. CUSTOM은 값이 필수이며 JSON 유효성과 길이 제한을 DB에서도 검사한다.
- Draft에서 다른 외형이나 이미지 단독으로 전환해도 자신의 틀을 보존한다. 완성 Design에는 실제 CUSTOM일 때만 복사한다.
- 기존 조회에서 함께 읽으므로 N+1과 별도 조회를 추가하지 않는다. S3 I/O는 기존처럼 DB 트랜잭션 밖이다.
- 기존 Migration, 기본 저금통 생성, 기존 사용자 데이터는 보존한다.

## 주요 변경 파일

| 역할 | 경로 |
| --- | --- |
| 첫 화면/전환 | `frontend/src/pages/JarDesignNewPage.jsx` |
| 틀 편집 | `frontend/src/features/jarDesign/components/JarBodyWorkshop.jsx` |
| 좌표 검증/기본 틀/사진 영역 | `frontend/src/features/jarDesign/customJarBody.mjs` |
| 사진 표시 | `frontend/src/features/jarDesign/components/CustomJarBodyArtwork.jsx` |
| 선택 목록/과거 외형 | `frontend/src/features/jarDesign/jarBodies.mjs` |
| 업로드 | `frontend/src/api/jarDesignDraftApi.js`, `src/main/java/shop/esjh/memoryjar/controller/ai/JarDesignDraftController.java` |
| 입력 검증 | `src/main/java/shop/esjh/memoryjar/dto/ai/CustomJarBodyValue.java` |
| JSON 변환/저장 | `src/main/java/shop/esjh/memoryjar/entity/ai/CustomJarBodyConverter.java`, `JarDesignDraft.java`, `JarDesign.java` |
| Draft 처리/최종화 | `JarDesignDraftUploadService.java`, `JarDesignDraftPersistenceService.java`, `JarDesignDraftService.java`, `JarDesignFinalizePersistenceService.java` |
| 영구 조회/응답 | `JarDesignViewService.java`, `JarDesignResponse.java`, `JarDesignDraftDetailResponse.java` |
| DB | `src/main/resources/db/migration/V51__add_custom_jar_body_outline.sql` |

`JarDesignImage`, `PhotoFrameEditor`, `AiCandidateGallery`, `CandidateComparison`, `SlotEditor`, `JarDesignFinalizePanel`, `JarCustomDesignVisual`에도 저장한 틀을 전달한다. 공통 렌더러를 사용해 화면별 계산 차이를 줄인다.

## 검증과 배포 주의

- 단위 테스트: 입력 제한, 교차 선, 작은 도형, JSON 왕복, 좌표 불변성, 외부 호출 전 거절, 최종화 스냅샷.
- Controller: JSON multipart, 필수 값 누락, 교차 선 거절, 구 외형 요청 호환.
- 실제 MariaDB Testcontainers: V50→V51 업그레이드, 기존 행 보존, JSON/CUSTOM 제약, JPA 저장/재조회.
- Node 테스트: 28종 필터와 과거 외형, 기본 틀, 잘못된 입력, 저장 공간 오류, 둥근/오목한 틀의 전체 사진 표시.
- 로컬 화면은 메모리 API다. 실제 운영 저장과 유료 AI 호출은 별도 검증 사항이다.
- **V51 포함 백엔드를 먼저 배포하고 프론트를 배포한다.** 구 프론트는 CUSTOM을 표시하지 못하므로 CUSTOM 생성 후 프론트 단독 롤백은 피한다.
- 위 검증은 로컬 결과이며 운영 배포 완료를 뜻하지 않는다.

### 2026-10-07 로컬 실행 결과

- `./gradlew.bat test bootJar --console=plain`: 131개 suite, 1,808개 테스트 통과. 실패/오류/스킵 0. MariaDB V51 업그레이드와 JPA 저장/재조회 포함.
- `node --test "frontend/src/**/*.test.mjs"`: 103개 통과, 실패/스킵 0.
- `npm --prefix frontend run build`: 성공. 기존 500kB 번들 크기 경고는 남아 있다.
- PC/390px 모바일 브라우저: 4개 점으로 새 틀 생성, 방향키 점 수정, 준비된 28종 목록으로 전환/복원, 사진 보존, 약 8MB 합성 JPEG 입력, Draft 생성, 전체 보기 적용, 모의 AI 후보 선택, 입구 저장, 완성 화면까지 확인했다. 새 틀 공방의 모바일 가로 넘침은 없었다.
- 위 화면 검증은 기존 개발 전용 메모리 API를 사용한다. 실제 모바일 기기, 운영 S3/DB 저장, 실제 AI 생성은 이번에 실행하지 않았다.
