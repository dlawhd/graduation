## 1. 기능 목표

사용자가 직접 그린 그림을:

```
원본 그대로 사용
또는
원하는 AI 스타일로 변환
```

하여 Memory Jar의 커스텀 디자인으로 사용한다.

AI 디자인의 목적은 **사용자가 그린 그림을 Memory Jar만의 특정 저금통 모양으로 강제로 바꾸는 것**이 아니다.

원본의 특징을 최대한 유지하면서 사용자가 선택한 스타일로 재해석하는 것이 목적이다.

---

## 2. 디자인 규칙의 적용 범위

### 2-1. 모든 AI 스타일에 적용하는 결과물 규칙

- 한 번의 AI 생성 요청에서는 결과 이미지 1개를 만든다.
- 결과 이미지 안에 원본의 의미 있는 인물이나 대상이 여러 개 있어도 된다.
- AI가 동전 투입구를 생성하지 않는다.
- 글자·로고·워터마크나 불필요한 장식 배경을 생성하지 않는다.
- 사용자가 선택한 최종 디자인의 Slot은 React에서 별도로 표시한다.

위 규칙은 BASE를 사용하지 않는 WEIRDO와 PIXEL에도 적용한다.

### 2-2. BASE를 사용하는 스타일의 원본 보존 규칙

다음 네 가지 스타일은 BASE와 스타일 전용 Prompt를 조합한다.

- CUTE_2D
- SOFT_25D
- WATERCOLOR
- HAND_DRAWN

BASE는 원본의 주제·방향·실루엣·구성·비대칭,
의미 있는 대상의 개수·배치·관계 및 주요 색상을
최대한 보존하도록 지시한다.

원본에 없는 받침대·프레임·원판·컨테이너·지지 구조물은
임의로 추가하지 않는다.

STYLE PROMPT는 해당 스타일의 표현 방식을 담당한다.

WEIRDO는 과감한 재해석을 위해 별도 Prompt 조합을 사용한다.
PIXEL은 전용 Prompt·Reference·후처리를 사용한다.
두 스타일 모두 BASE는 사용하지 않는다.

---

# 3. JarTheme 정책

AI 디자인과 기존 `JarTheme`은 완전히 분리한다.

```
JarTheme
→ 화면/UI 분위기

AI 디자인
→ 실제 커스텀 저금통 이미지
```

따라서:

- `SPRING`
- `SUMMER`
- `AUTUMN`
- `WINTER`
- 기타 기존 Theme

색상에 맞춰 AI 이미지를 강제로 다시 칠하지 않는다.

예:

```
JarTheme = LAVENDER
AI Style = PIXEL
```

이어도 AI 이미지는 Pixel 결과의 원래 색상을 유지한다.

즉:

```
JarTheme 색상 매핑 ❌
AI 결과 강제 recolor ❌
```

이다.

---

# 4. 스타일별 Prompt 구조

## 🖍️ 원본 그대로

```
AI 호출 없음
```

사용자가 Canvas에서 완성한 원본 이미지를 그대로 사용한다.

최종 Jar 생성 시 원본 임시 이미지를 **최종 영구 S3 이미지로 복사**한다.

---

## 🌸 귀여운 2D

```
BASE
+
CUTE_2D
```

---

## 🧸 소프트 2.5D

```
BASE
+
SOFT_2_5D
```

---

## 🎨 수채화

```
BASE
+
WATERCOLOR
```

---

## ✏️ 손그림

```
BASE
+
HAND_DRAWN
```

---

## 😜 괴짜 캐릭터

여기는 현재 적어둔 내용을 조금 수정하면 돼.

최종 구조는:

```
FUNNY_CHARACTER_UNIVERSAL
+
FUNNY_CHARACTER_CRAZY_BOOST
```

이다.

```
BASE 사용 ❌
```

괴짜 스타일은 원본 보존 위주의 일반 스타일과 달리 **의도적으로 과감한 재해석**을 하는 스타일이기 때문에 BASE를 사용하지 않는다.

즉 기존 문서의:

```
😜 괴짜 캐릭터
→ FUNNY_CHARACTER_UNIVERSAL

- FUNNY_CHARACTER_CRAZY_BOOST
```

보다는 다음처럼 쓰는 게 정확해.

```
😜 괴짜 캐릭터
→ FUNNY_CHARACTER_UNIVERSAL
  + FUNNY_CHARACTER_CRAZY_BOOST
→ BASE 사용 안 함
```

---

## 🟪 픽셀

```
PIXEL_PROMPT_V5
+
PIXEL 전용 Reference
+
PIXEL 전용 후처리
```

구체적으로:

```
Prompt
→ PIXEL_V5

Reference
→ PIXEL_REF_V1

Postprocess
→ PIXEL_PP_V1
```

현재 `PIXEL_PP_V1`의 의미는:

```
Cloudflare 생성 결과
↓
64 × 64 bilinear 축소
↓
최대 24색 median-cut 팔레트
↓
Nearest Neighbor
↓
480 × 480 최종 확대
```

이다.

Pixel은:

```
BASE 사용 ❌
```

이다.

### PIXEL 구현 및 검증 상태

`PIXEL_PP_V1`은 PoC에서 검증한 처리 방향을
운영 Java 코드로 옮기기 위한 설계 버전이다.

Python·Pillow PoC 결과를 운영 구현 완료로 간주하지 않는다.

실제 Cloudflare 모델이 PIXEL Reference를 포함한
두 이미지 입력을 어떤 형식으로 받는지는 운영 연동 전에
현재 API 계약과 실제 요청·응답으로 검증한다.

PIXEL의 최종 후처리 목표 해상도는 480 × 480이다.
다른 AI 스타일의 원본 출력 해상도까지 480 × 480이라고
가정하지 않는다.

AI 응답이 성공하더라도 결과 이미지의 디코딩·형식·용량 등
필요한 검증과 후처리, S3 저장까지 완료되어야
Generation을 SUCCEEDED로 기록한다.

---

# 5. Reference 이미지 정책

공통 Memory Jar Reference 이미지는 사용하지 않는다.

```
CUTE_2D      → Reference 없음
SOFT_2_5D    → Reference 없음
WATERCOLOR   → Reference 없음
HAND_DRAWN   → Reference 없음
WEIRDO       → Reference 없음

PIXEL        → PIXEL 전용 Reference 사용
```

현재:

```
PIXEL_REF_V1
```

을 사용한다.

실제 파일도 그냥:

```
pixel-reference.png
```

보다는 최종적으로:

```
pixel-reference-v1.png
```

처럼 버전을 붙이는 게 좋아.

그리고 중요한 운영 규칙:

```
pixel-reference-v1.png 내용 교체 ❌

새 Reference가 필요하면
pixel-reference-v2.png 생성 ✅
```

이다.

---

# 6. 동전 투입구 처리

AI가 투입구를 그리지 않는다.

최종 흐름은:

```
그림 그리기
↓
[그림 완성]
↓
원본 또는 AI 후보 생성
↓
최종 디자인 선택
↓
사용자가 투입구 위치 지정
↓
사용자가 투입구 크기 Slider 조절
↓
최종 미리보기
↓
Jar 생성
```

투입구는 최종 PNG에 합성해서 저장하지 않는다.

DB에 별도로:

```
slot_center_x
slot_center_y
slot_size_ratio
```

를 저장하고 React에서 Overlay한다.

### Slot 좌표 계약

- `slot_center_x`: 실제 렌더링된 이미지 영역 기준 중심 X, 0~1
- `slot_center_y`: 실제 렌더링된 이미지 영역 기준 중심 Y, 0~1
- `slot_size_ratio`: Slot 크기 슬라이더의 정규화 값, 0~1

`slot_size_ratio`는 이미지 너비에 직접 곱하는 실제 폭 비율이 아니다.
실제 Slot 크기로 변환하는 공식은 별도로 확정해야 한다.

Slot은 화면 전체나 이미지 바깥의 부모 컨테이너가 아니라
실제 이미지가 표시되는 영역을 기준으로 배치한다.

Slot의 너비와 높이까지 고려해 이미지 경계를 벗어나지 않도록
검증한다.

최종 PNG에 Slot을 합성해서 저장하지 않는다.
Jar 생성 후에는 이미지와 Slot 설정을 변경하지 않는다.

DEFAULT 디자인은 커스텀 Slot을 저장하지 않는다.

---

# 7. Prompt 버전 관리 정책

AI 생성 이력을 저장할 예정인 `jar_ai_generations`에는
실제 생성에 사용한 프롬프트 조합을 기록하는 `prompt_version` 컬럼이 있다.

따라서 프롬프트를 수정하더라도 과거에 사용한 내용을 확인할 수 있도록
**프롬프트 파일과 Reference 이미지를 버전별로 관리한다.**

## 7-1. 버전별 파일을 사용하는 이유

다음처럼 버전이 없는 파일명만 사용하면:

```
base.txt
cute-2d.txt
watercolor.txt
```

파일 내용을 나중에 수정했을 때 과거 Generation의
`prompt_version = BASE_V1+CUTE_2D_V1`이
정확히 어떤 내용을 가리켰는지 확인하기 어려워진다.

따라서 파일명에도 버전을 명시한다.

```
base-v1.txt
cute-2d-v1.txt
watercolor-v1.txt
```

## 7-2. 프롬프트 리소스 구조

> 아래는 **운영 구현 시 사용할 예정인 폴더 구조**다.
현재 프로젝트에 모든 파일이 이미 생성되어 있다는 의미는 아니다.
실제 경로와 버전명은 구현 시 최신 프로젝트 코드를 확인하여 확정한다.
>

```
backend/
└── src/main/resources/ai/
    ├── prompts/
    │   ├── base-v1.txt
    │   ├── cute-2d-v1.txt
    │   ├── soft-2-5d-v1.txt
    │   ├── watercolor-v1.txt
    │   ├── hand-drawn-v1.txt
    │   ├── funny-universal-v1.txt
    │   ├── funny-crazy-boost-v1.txt
    │   └── pixel-v5.txt
    │
    └── references/
        └── pixel-reference-v1.png
```

`backend/`는 설명용 경로이므로 실제 프로젝트의
백엔드 모듈 경로에 맞춰 저장한다.

## 7-3. 스타일 ID와 프롬프트 버전은 구분한다

DB의 `ai_style`은 사용자가 선택한 스타일을 나타내고,
`prompt_version`은 실제 사용한 프롬프트 조합을 나타낸다.

```
귀여운 2D

ai_style       = CUTE_2D
prompt_version = BASE_V1+CUTE_2D_V1
```

```
소프트 2.5D

ai_style       = SOFT_25D
prompt_version = BASE_V1+SOFT_2_5D_V1
```

```
괴짜 캐릭터

ai_style       = WEIRDO
prompt_version = FUNNY_UNIVERSAL_V1+FUNNY_CRAZY_BOOST_V1
```

```
픽셀

ai_style                = PIXEL
prompt_version          = PIXEL_V5
reference_image_version = PIXEL_REF_V1
postprocess_version     = PIXEL_PP_V1
```

즉, DB 스타일 ID와 프롬프트 파일명이 반드시 같을 필요는 없다.

괴짜 캐릭터와 픽셀 스타일에는 BASE를 사용하지 않는다.

## 7-4. 운영에 사용한 버전은 덮어쓰지 않는다

한 번 운영에 사용한 프롬프트 파일과 Reference 이미지는
기존 내용을 수정하지 않는다.

예를 들어:

```
cute-2d-v1.txt
```

를 운영에 사용했다면, 프롬프트를 개선할 때는:

```
cute-2d-v1.txt 수정 ❌
cute-2d-v2.txt 새로 생성 ✅
```

한다.

Reference 이미지도 동일하다.

```
pixel-reference-v1.png 덮어쓰기 ❌
pixel-reference-v2.png 새로 생성 ✅
```

새 버전을 적용할 때는 코드의 버전 매핑도 함께 변경하고,
새로운 Generation에는 실제 사용한 버전을 기록한다.

기존 Generation의 버전 기록은 변경하지 않는다.

## 7-5. 현재 구현 상태

이 문서는 AI 디자인의 **확정된 설계 규칙**을 설명한다.

현재 프로젝트에는 버전 고정 프롬프트 리소스, `jar_ai_generations` 테이블,
Java Pixel 후처리(`64×64 → 24색 → 480×480`)와 버전 기록 저장이 구현되어 있다.

실제 Cloudflare/S3 운영 연동과 배포 검증은 별도이며, 새 스타일 또는 새 Reference를 추가할 때는
버전 매핑과 Generation 기록 저장을 다시 테스트한다.

---

# 8. DB에 저장되는 Prompt 정보

Generation마다 실제 사용한 Prompt 조합을 기록한다.

예:

```
귀여운 2D

ai_style
= CUTE_2D

prompt_version
= BASE_V1+CUTE_2D_V1
```

괴짜:

```
ai_style
= WEIRDO

prompt_version
= FUNNY_UNIVERSAL_V1+FUNNY_CRAZY_BOOST_V1
```

픽셀:

```
ai_style
= PIXEL

prompt_version
= PIXEL_V5

reference_image_version
= PIXEL_REF_V1

postprocess_version
= PIXEL_PP_V1
```

이렇게 서로 역할을 분리한다.

---

# 9. 스타일 ID와 Prompt 이름은 구분

DB `ai_style`은 우리가 확정한 다음 6개를 사용한다.

```
CUTE_2D
SOFT_25D
WATERCOLOR
HAND_DRAWN
WEIRDO
PIXEL
```

여기서:

```
WEIRDO
```

는 서비스 내부 Style ID이고,

실제 Prompt 파일은:

```
funny-universal-v1.txt
funny-crazy-boost-v1.txt
```

두 개를 사용할 수 있다.

즉 **DB 스타일 이름과 Prompt 파일명이 반드시 동일할 필요는 없다.**

---

# 10. Background 규칙도 약간 더 정확하게 표현

현재 문서의:

> 배경 금지
>

는 방향 자체는 맞아.

다만 AI 모델 특성상 기술적으로 완전한 투명 배경이 항상 바로 나오지는 않을 수 있으니 구현 기준은:

> **의미 있는 배경·장면·풍경·장식 배경을 생성하지 않는다. 최종 디자인은 독립된 대상 중심으로 만든다. 기술적으로 Canvas가 필요한 경우 빈 흰색/밝은 중립 배경만 허용하고 필요 시 후처리한다.**
>

정도로 적어두면 실제 구현에서 더 안전해.

모든 AI 결과가 자동으로 투명 배경을 제공한다고 가정하지 않는다.

배경 제거 또는 투명화 후처리를 도입할지는 실제 생성 결과와
커스텀 저금통 화면의 요구사항을 확인한 뒤 결정한다.

배경 처리 방식을 변경할 경우 기존 Prompt 및 이미지와
호환되는지 검증하고 필요한 버전을 구분한다.

---

# 11. 최종 버전 명칭

문서 자체:

```
Memory Jar AI Design Rules v1
```

유지해도 돼.

다만 이것과 개별 Prompt 버전은 별개야.

```
Memory Jar AI Design Rules v1
│
├─ BASE_V1
├─ CUTE_2D_V1
├─ ...
├─ PIXEL_V5
├─ PIXEL_REF_V1
└─ PIXEL_PP_V1
```

이런 관계로 보면 돼.

---

## 그래서 네 문서에서 실제로 수정할 부분만 압축하면

**그대로 유지 ✅**

```
기능 목표
공통 보존 규칙
JarTheme 분리
AI 동전 투입구 생성 금지
원본 그대로 = AI 미사용
BASE 사용하는 일반 스타일
Pixel만 Reference 사용
Pixel 64/24/480
공통 Memory Jar Reference 없음
```

**수정 필요 🔧**

```
1. 괴짜
FUNNY_UNIVERSAL
+
FUNNY_CRAZY_BOOST
로 명확히 표시

2. pixel-reference.png
→ pixel-reference-v1.png

3. Prompt 파일
base.txt
→ base-v1.txt처럼 버전 명시

4. Prompt/Reference는
운영에 사용된 버전을 덮어쓰지 않음

5. PIXEL 후처리에
PIXEL_PP_V1이라는 버전명 부여

6. "배경 금지"를
의미 있는 배경 생성 금지 + 필요 시 빈 중립 Canvas 허용
정도로 조금 더 정확하게 표현
```

그래서 **설계 방향 자체가 바뀐 건 없어.** 오히려 DB 설계까지 끝내면서 지금 문서에 **“버전 추적 규칙”이 추가된 것**이 가장 큰 변화야. 이 상태로 수정하면 현재 우리가 확정한 최종 DB/서비스 구조하고 딱 맞아.

# 12. 원본 이미지 검증과 콘텐츠 심사

Canvas 원본은 Spring Boot에서 실제 PNG 형식,
이미지 디코딩 가능 여부, 480 × 480 해상도와
허용 파일 크기를 검증한다.

파일 형식 검증과 이미지 내용의 적절성 검사는 별개의 작업이다.

부적절한 콘텐츠로 판정된 원본은 AI 변환과
ORIGINAL 디자인의 최종 사용을 모두 금지한다.

콘텐츠 심사 도구, 판정 기준, 검사 실패 시 처리 방식과
AI 생성 결과의 추가 심사 범위는 아직 결정되지 않았다.

심사를 완료하지 않은 원본을 승인된 ACTIVE Draft로
취급해서는 안 된다.

세부 상태 관리 및 데이터 계약은
`docs/ai/AI_ERD.md`를 참고한다.
