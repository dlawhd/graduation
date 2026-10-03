# 사진 배치 구현 계약 — 2026-10-04 / V39

## 제작 흐름

저금통 본체 또는 `이미지만 사용하기` → 그림/업로드 → 본체 사용 시 사진 배치 → 선택적 AI 변환 → 선택 후보의 사진 배치 → 투입구 → 최종 Jar 생성.

- 본체 모드는 사진 창을 빈틈없이 채우는 기본 배치와 확대(1~4배)·가로/세로 위치·드래그·방향키·Shift 미세 이동을 제공한다. 원본의 선택 영역과 실제 본체 합성을 함께 보여준다.
- 제작 중 본체 30종을 바꾸거나 이미지 단독으로 전환할 수 있다. 이미지 단독에서 본체로 돌아오는 것도 가능하다. 전환은 원본 재업로드/AI 재생성을 하지 않는다.
- 이미지 단독은 기존 외곽선 자르기·배경 제거 화면을 사용한다. 본체 모드는 외곽선 제거를 적용하지 않는다. 원본 파일 자체의 여백·투명 영역을 자동으로 제거하는 기능은 아니다.
- 배치 변경은 기존 투입구와 외곽선을 초기화한다. 동일 배치 재적용은 멱등이며 기존 투입구를 지우지 않는다. 다른 후보 선택도 배치/투입구를 초기화해 실제 후보에 맞게 다시 확인한다.
- 기존 기본 테마 Jar 생성 및 완성된 Jar의 디자인 불변 정책은 유지한다.

## DTO / API

`PATCH /api/v1/design-drafts/{draftId}/composition`, 로그인·CSRF 필요, 성공 `204`.

```json
{
  "bodyStyle": "CAT",
  "photoFrame": {"x": 0.125, "y": 0.25, "width": 0.5, "height": 0.5},
  "expectedDesignType": "ORIGINAL",
  "expectedGenerationId": null,
  "expectedBodyStyle": "CAT",
  "expectedPhotoFrame": null
}
```

- `bodyStyle`는 기존 30종 enum 또는 null. 이미지 단독 전환은 `bodyStyle`, `photoFrame`을 모두 null로 보낸다. 이는 `DEFAULT` 선택과 다르다.
- `photoFrame`은 480 정사각형 원본 좌표를 0~1로 정규화한 좌상단/폭/높이다. 소수점 최대 6자리, 폭/높이 최소 0.000001, 이미지 안쪽이어야 한다. 프론트는 본체 사진 창과 동일한 가로세로 비율을 계산한다.
- `expected*`는 편집 시작 시 선택 종류/후보/본체/배치의 스냅샷이다. OWNER·ACTIVE·만료 검사와 행 잠금 후 비교한다. 불일치는 `409 DRAFT_COMPOSITION_TARGET_CHANGED`, 잘못된 배치는 `400 DRAFT_PHOTO_FRAME_INVALID`다. Bean Validation 오류는 기존 공통 응답 규칙을 따른다.
- 변경/만료 오류는 같은 오래된 요청의 재전송을 막고 최신 상태를 불러오는 버튼을 제공한다. 일시 저장 실패는 편집값을 보존해 재시도한다.
- Draft 상세 응답에 `photoFrame`, `originalContentFrame`을 추가한다. 기존 Jar 목록·상세의 `JarDesignResponse`에 `photoFrame`을 추가한다. 필드 미존재/NULL은 예전 표시로 처리한다.
- `originalContentFrame`은 새 업로드의 EXIF 보정 후 실제 사진 영역이다. 기존 480 흰 배경 정규화에서 붙인 띠만 배치 기준에서 제외한다. 원본/AI 입력 PNG는 기존 방식 그대로다. AI 후보 배치는 전체 정사각형을 기준으로 한다.

## DB와 최종화

- `V39__add_jar_photo_framing.sql`: Draft `photo_x/y/width/height`, `original_x/y/width/height`; Design `photo_x/y/width/height`. 모두 nullable DECIMAL(7,6).
- CHECK는 전부 NULL 또는 전부 유효한 조합만 허용한다. Draft 사진 배치는 ORIGINAL/AI 선택과 본체가 필요하다. SQL NULL/UNKNOWN 우회도 막는다.
- Embeddable 값으로 저장하므로 추가 테이블/조회 없이 기존 Draft/Design 조회를 재사용한다.
- Finalize S3 처리 전후의 스냅샷에 배치 값을 포함하고 최종 Design에 복사한다. 복사 중 다른 탭이 배치를 변경하면 잘못된 최종화를 거부한다. 프레이밍 때문에 별도의 S3 재처리/외부 AI 호출을 추가하지 않는다.
- 목록·상세·확대·투입구·최종 미리보기·생성 연출은 동일 렌더러를 사용한다. 입구는 여전히 전체 480 좌표이므로 사진 배치와 별개이며 쪽지 입구 애니메이션 좌표 계약도 유지한다.

## 호환성과 배포

- 기존 V1~V38을 수정하지 않는다. 기존 배치 NULL 데이터와 완성된 Jar를 백필/변경하지 않는다. 배치 NULL 본체는 기존 contain 표시, 본체 NULL은 기존 이미지 단독 표시다.
- V39 포함 백엔드를 먼저 배포하고 새 프론트를 배포한다. 실제 운영 V39 적용/사용자 파일/유료 AI 연동 검증은 별도다.
- 구 프론트는 새 `photoFrame`을 무시해 신규 저금통 배치가 다르게 보일 수 있다. 구버전 롤백 시 함께 검토해야 한다. 새 프론트를 구 백엔드에 먼저 배포하면 composition API가 없으므로 저장할 수 없다.

## 검증 범위

좌표/사진 창 비율/슬라이더 복원 단위 테스트, Controller 인증/입력 검증, OWNER/만료/변경 경합/멱등성 서비스 테스트, Finalize 스냅샷 및 Design 전달, 업로드 정규화/보상 처리, MariaDB V38→V39 마이그레이션 CHECK, 실제 JPA 저장/재조회, 로컬 HTTP 메모리 어댑터를 이용한 UI 검증을 수행한다. 운영 요청 또는 유료 AI 호출은 로컬 검증에서 하지 않는다.
