# 직접 만드는 저금통 틀 — V51

## 새 사용 순서

새 저금통 → 직접 만들기 → **틀 만들기** → 그림 그리기/사진 선택 → 사진 배치 → 선택 사항인 AI 변환 → 후보 선택 → 입구와 배경 → 저금통 생성.

- 사진 그림판과 같은 도구로 틀을 칠한다. 펜, 지우개, 도형, 채우기, 팔레트, 굵기, 실행 취소/다시 실행, 회전/반전, 격자/확대를 제공한다. 기존 점 이동과 방향키 편집은 선택 사항인 정밀 편집에 보존한다.
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
| 공통 그림판 | `frontend/src/features/jarDesign/components/JarDesignCanvas.jsx` |
| 색칠 영역 → 좌표 / 틀 채우기 | `frontend/src/features/jarDesign/bodyPainting.mjs` |
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

### 2026-10-09 그림판 방식으로 개선

- 외곽선을 한 번에 그리는 UI 대신 기존 사진 그림판을 재사용한다. 칠한 영역이 틀의 실루엣이 되며, 사진/그림 원본과는 별도로 편집한다.
- 틀은 한 가지 색의 연결된 영역이다. 색을 바꾸면 이미 칠한 외형도 같은 색으로 바뀐다. 도형은 내부를 자동으로 채운다. 펜으로 닫힌 선을 그렸다면 채우기로 내부를 메운다.
- 흰색 틀과 투명한 빈 영역을 구분한다. 틀의 채우기는 반투명 가장자리의 RGB가 아닌 영역 마스크를 사용해 가느다란 빈 구멍이 남지 않도록 한다.
- 획 완료, 채우기, 실행 취소 시에만 외곽선을 계산한다. 최대 96점, 최대 2.5px 경계 근사와 기존 좌표 검증을 적용한다. 떨어진 조각, 내부 구멍, 지나치게 작거나 복잡한 외형을 임의로 버리거나 적용하지 않고 설명과 함께 진행을 차단한다.
- 준비된 목록/그림 담기 화면으로 이동해도 틀 Canvas를 숨겨 유지한다. 미완성 획과 최대 25단계 이력은 현재 페이지에서 유지되며, 새로고침에는 유효한 좌표/색상만 복원한다. 기존 사진 그림판의 7개 도구, 6가지 펜과 PNG 확정은 유지한다.
- 서버 DTO, API, DB, AI 입력은 변경하지 않는다. 임의 SVG나 PNG를 추가 저장하지 않고 V51 좌표/색상 계약을 그대로 사용한다. 추가 라이브러리는 없다.
- 검증: Node 116개 통과(새 마스크/좌표 테스트 13개 포함), 프론트 빌드 성공. 기존 500kB 번들 경고는 남아 있다.
- 로컬 브라우저: 1280px PC와 390px 모바일 폭에서 기본 틀, 겹친 도형, 펜, 지우개, 내부 구멍 안내/진행 차단, 채우기 복구, 색 변경, 실행 취소/다시 실행, 정밀 점 편집, 목록 왕복 시 좌표/이력 보존, 그림 담기 전환과 기존 그림 PNG 확정 확인. 직접 만든 틀을 multipart로 전달해 모의 Draft 사진 배치까지 이어지는 것도 확인했다. 모바일 가로 넘침과 검증 탭의 콘솔 오류 없음.
- 위 결과는 개발 전용 메모리 API 검증이다. 실제 모바일 터치 기기, 운영 저장과 유료 AI 생성, 배포는 이번에 실행하지 않았다. 백엔드는 변경하지 않아 이번 작업에서 백엔드 테스트를 다시 실행하지 않았다.

### 2026-10-09 캐릭터 도형과 펜 확장

- 도형을 `캐릭터 친구들`과 `기본 도형`으로 나눈다. 고양이, 토끼, 곰돌이, 강아지, 여우, 햄스터, 개구리, 펭귄, 고래, 오리, 공룡, 유령의 오리지널 실루엣 12종을 추가한다. 기존 기본 도형은 보존한다.
- 틀용 펜을 3종에서 8종으로 늘린다. 마커, 납작 펜, 리본 붓, 부드러운 붓, 몽글 펜을 추가한다. 사진 그림판은 기존 6종에 새 펜 4종을 더해 10종이다. 메뉴에서도 실제 렌더러의 획을 표시한다.
- 틀의 마커와 붓은 불투명하고 연결된 외곽선으로 그린다. 분리된 입자를 만드는 크레용/스프레이는 사진 그림판에만 유지한다. 몽글 장식은 일정한 거리로 배치하며 최대 4,096개로 제한한다.
- 캐릭터의 미리보기와 실제 그림은 같은 경로 정의를 사용한다. 사용자 SVG나 외부 파일이 아닌 기존 숫자/색상 계약으로 저장한다. 서버/API/DB 변경과 새 라이브러리는 없다.
- 자동 검증: Node 121개 통과, 프론트 빌드 성공. 기존 500kB 번들 경고는 남아 있다.
- 브라우저 검증: 캐릭터 12종 × 드래그 방향 2가지 × 테두리 굵기 1/24/64px의 72조건과 틀용 펜 8종의 연결/저장 변환을 확인했다. 실제 도구 선택, 캐릭터 그리기와 확정, 펜 덧그리기, 실행 취소/복원, 사진 그림판 10종 메뉴와 PNG 확정, 커스텀 틀의 모의 Draft 사진 배치 연결을 확인했다. PC 1280px/모바일 390px 화면의 가로 넘침과 콘솔 오류는 없었다.
- 검증용 `frontend/tests/character-tools-preview.html`은 서버 요청 없는 개발 전용 화면이며 기본 제품 빌드에 포함되지 않는다. 운영 저장, 실제 모바일 터치 기기, 실제 AI 호출/배포, 백엔드 테스트 재실행은 이번 작업 범위 밖이다.

### 2026-10-09 빈 틀 미리보기

- 틀 공방에서 사진이 없을 때만 속이 빈 테두리로 표시한다. 내부 색/흰 사진 영역/그림자는 그리지 않으며 밝은 틀 색도 구분할 수 있는 얇은 경계를 남긴다. 안내 문구도 빈 내부에 사진을 담는다는 설명으로 맞춘다.
- Canvas에서 칠한 영역, 외곽선 추출과 좌표 저장은 그대로다. 사진이 들어오면 기존 합성으로 표시한다. 옵션을 지정하지 않는 사진 배치/AI 후보/완성 화면도 기존 렌더링을 유지한다.
- `CustomJarBodyArtwork.jsx`, `JarBodyWorkshop.jsx`와 개발 전용 비교 화면을 수정했다. 새로운 API 요청, DB 변경, 라이브러리, 상태나 타이머는 추가하지 않았다.
- 검증: Node 121개 통과, 프론트 빌드 성공(기존 번들 경고 유지). 브라우저에서 빈 틀/사진이 있는 틀/기존 기본 렌더링을 비교하고 캐릭터 12종의 빈 내부 표시를 확인했다. 비교 화면의 PC 1280px/모바일 390px 가로 넘침 없음. 운영 저장/실제 터치 기기/배포/백엔드 테스트 재실행은 이번에 하지 않았다.
