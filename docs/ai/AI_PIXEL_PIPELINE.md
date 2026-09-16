# Memory Jar AI PIXEL 파이프라인 — 설계·구현 가이드

> **권장 저장 위치:** `docs/ai/AI_PIXEL_PIPELINE.md`
>
>
> **문서 상태:** PIXEL 설계 방향 확정 · 실제 프로젝트 통합/운영 검증 전
>
> **정리일:** 2026-09-16
>
> **현행 코드 기준:** `graduation-main (36).zip`의 Spring Boot/React 구조
>
> **상세 연계 문서:** `docs/ai/AI_DESIGN_PLAN.md` · `docs/ai/AI_ERD.md` · `docs/ai/AI_DESIGN_RULES.md`
>

**목적:** Windows에서 진행한 PIXEL PoC의 검증 결과를, 아직 저금통을 생성하지 않은 **Draft 기반 AI 커스텀 디자인 기능**에 통합하기 위한 정확한 구현 계약으로 정리한다. 이 문서에 표시한 예정 파일·테이블·API가 현재 `(36)` 프로젝트에 이미 존재한다는 뜻은 아니다.

---

## 0. 기존 문서 대비 수정한 핵심

| 기존 문서에서 혼동할 수 있는 표현 | 이 문서의 수정·보완 |
| --- | --- |
| `React + Spring + MariaDB + S3 + Cloudflare`가 모두 이미 통합된 것처럼 서술 | **현재 구현**(React/Spring/MariaDB/S3)과 **AI 통합 예정**(Cloudflare/신규 테이블/Java PIXEL 후처리)을 분리 |
| PoC의 `input_image_0`/`input_image_1`은 실제 REST 계약인지 불확실하다고만 설명 | Cloudflare의 **공식 FLUX.2 Klein 4B 문서에서 필드명·다중 입력 지원 확인**. 다만 실제 **우리 Java 연동·응답 처리 테스트는 미완료** |
| 원본 480×480이면 PIXEL Reference 크기는 따로 언급하지 않음 | 공식 문서의 **각 입력 이미지 가로·세로 512px 미만** 조건에 맞춰 Reference도 확인 |
| `seed = 랜덤값`으로 무조건 기록 | 시드는 **선택 값**. 실제 요청에 보낸 값만 저장하며 미전송 시 NULL, 동일 시드의 완전 동일 출력은 보장하지 않음 |
| AI 성공 응답만으로 생성 성공 처리할 여지 | 모델 응답 파싱 → 유효한 이미지 디코딩 → Java 후처리 → PNG 검증 → Private S3 저장 → 유효한 상태 전이까지 성공해야 `SUCCEEDED` |
| 성공 처리·Timeout·Draft 종료가 경합할 때 규칙 부족 | Draft 행을 공통 조정 지점으로 사용, 늦은 결과의 상태 되돌리기 금지 및 S3 정리 필요 |
| 미리 정한 임시 S3 경로를 실제 구현 경로처럼 표시 | 예시 경로와 서버가 Key를 생성·보호해야 한다는 **확정 원칙**을 분리 |
| `Cloudflare Raw 이미지는 영구 저장하지 않음` | v1의 설계 선택으로 유지. 운영 진단용 일시 데이터와 영구 DB/S3 기록을 구분 |
| Pixel만의 새 20단계 구현 순서 | **전체 AI 마스터 24단계**에 대응시킴. PIXEL용 별도 마스터 번호 생성 금지 |
| 결과 이미지의 내용 심사 누락 | 원본의 **부적절 콘텐츠 차단 요구**를 명시. 파일 검증은 콘텐츠 심사가 아니며 심사 수단·장애 정책은 미결정 |
| Jar 생성 후 AI Apply 가능해 보일 수 있음 | **Draft → Generation → 후보 선택 → Slot → Finalize**로 고정. 생성 완료된 Jar의 Apply/Revert 없음 |

---

## 1. 현재 상태와 구현 범위

### 1-1. `(36)`에 이미 존재하는 기반

- React 프론트엔드와 Spring Boot 백엔드, MariaDB, S3 기반의 기존 저금통/쪽지 기능.
- 일반 파일 업로드를 위한 기존 S3 처리 구조와 기존 Jar 생성·권한·테마·오픈 기능.
- PIXEL 전용 AI Draft/Generation/JarDesign은 아직 통합되지 않았다. `(36)` ZIP에 AI 전용 테이블, Cloudflare 클라이언트, PIXEL 운영 리소스, Java `PixelPostProcessor`가 있다고 가정하지 않는다.
- 현재 소스의 백엔드 리소스 루트는 프로젝트 루트 아래 `src/main/resources/`이다. 아래 `backend/` 접두어는 개념도에서만 사용하며 실제 파일 경로를 임의로 만들지 않는다.

### 1-2. PoC에서 확인한 것과 앞으로 검증할 것

| 구분 | 상태 |
| --- | --- |
| Windows에서 FLUX.2 Klein 4B를 호출하고 이미지 결과 확인 | **PoC 진행·실험 기록 존재** |
| PIXEL 전용 Reference와 PIXEL V5 프롬프트 실험 | **PoC 설계·결과 기록 존재** |
| Python/Pillow의 48×48·16색·최근접 확대 | **PoC 처리 방향 확인** |
| 동일 후처리를 운영 Java로 옮겨 원본과 픽셀 결과를 비교 | **미구현·검증 전** |
| Cloudflare 입력 2장 지원·필드명 | **공식 문서 확인**. 실제 운영 토큰/계정/Java 요청 결과는 별도 검증 |
| S3 임시·영구 객체 관리 및 Flyway 신규 테이블 | **설계 확정 범위와 미결정 항목 존재, 구현 전** |

사용자에게 서비스가 이미 PIXEL 디자인을 지원하는 것처럼 표현하지 않는다.

---

## 2. 고정된 사용자 경험: Jar 생성 전에 디자인한다

```
저금통 만들기
├─ 기본 저금통을 처음부터 선택
│  └─ 기존 POST /api/v1/jars → 기존 Jar 생성 (Draft·Generation·JarDesign 없음)
│
└─ 직접 그려서 만들기
   └─ React 480×480 Canvas
      └─ [그림 완성]
         └─ 원본 PNG 검증·콘텐츠 심사·Private S3 보관
            └─ jar_design_drafts 생성
               ├─ ORIGINAL 선택
               ├─ AI 스타일별 후보 생성
               │  └─ PIXEL 후보도 여러 개 생성 가능
               └─ DEFAULT 선택
                  ↓
               최종 디자인 선택
                  ↓  (ORIGINAL/AI에서만)
               Slot 위치·크기 설정
                  ↓
               최종 미리보기
                  ↓
               [저금통 만들기] = Finalize
                  ↓
               jars 생성 + 필요 시 jar_designs 생성
                  ↓
               Draft FINALIZED
```

**중요:** PIXEL 생성 성공 시점에는 `jar_id`가 없다. 결과는 Jar의 대표 이미지가 아니라 **Draft 소속 후보**다. 이미 만들어진 Jar에서 AI를 다시 생성하거나 적용·복구하는 기능은 제공하지 않는다.

- `ORIGINAL`: 원본 이미지를 영구 객체로 복사하고 JarDesign 생성.
- `AI`(PIXEL 포함): 선택한 성공 후보를 별도 영구 객체로 복사하고 JarDesign 생성.
- `DEFAULT`: 기존 Jar 생성 핵심 로직 재사용. Draft를 FINALIZED로 기록하지만 JarDesign은 생성하지 않고 Slot 값은 모두 NULL.
- 처음부터 기본 Jar: Draft 없이 기존 API/코드로 생성.
- Draft 조작·AI 생성·후보 선택·최종화는 **해당 Draft OWNER만** 가능. 완성된 이미지 조회는 기존 Jar의 열람 권한을 따른다.

---

## 3. PIXEL 디자인의 목표와 공통 규칙

PIXEL은 단순히 원본의 외곽선만 네모나게 만드는 필터가 아니다. **내부의 색면·음영·하이라이트·세부 표현까지** 읽을 수 있는 레트로 2D 스프라이트처럼 표현하는 것이 목표다.

- 주제·배치·방향·실루엣·색상은 가능한 범위에서 원본 중심으로 유지한다.
- 의미 있는 인물이나 대상이 여러 개라면, 한 장의 결과 이미지 안에서 수와 관계를 보존하도록 지시한다.
- 작은 아이콘에서도 알아볼 수 있는 블록 픽셀 형태를 우선한다.
- 전체 이미지의 내부 표현까지 픽셀 블록과 제한 팔레트를 적용한다.
- 부드러운 벡터 모양, 흐린 픽셀 경계, 입체적인 3D 표현, 임의 배경·글자·워터마크·받침대 등을 만들지 않도록 지시한다.
- **AI에게 동전 투입구를 그리도록 하지 않는다.** Slot은 디자인 선택 후 React Overlay로 배치한다.
- PIXEL에는 일반 스타일용 BASE 프롬프트를 붙이지 않는다. **PIXEL_V5 단독 + PIXEL_REF_V1 + PIXEL_PP_V1**로 구성한다.
- 공통 Memory Jar Reference나 JarTheme 색상 강제 재칠하기를 사용하지 않는다. Theme는 주변 UI·배경이고 PIXEL은 저금통 이미지다.
- 의미 있는 배경은 지양하지만, 모델이 투명 배경을 항상 반환한다고 단정하지 않는다. 배경 제거 도입 여부는 실제 출력에 따라 별도 결정한다.

정확한 프롬프트 본문 및 공통 디자인 규칙은 `docs/ai/AI_DESIGN_RULES.md`를 따르며, 본 문서는 PIXEL 처리 경로에 집중한다.

---

## 4. 버전·리소스 계약

| 항목 | PIXEL v1 운영 설계값 | 저장 또는 사용 위치 |
| --- | --- | --- |
| `ai_style` | `PIXEL` | `jar_ai_generations` |
| `prompt_version` | `PIXEL_V5` | `jar_ai_generations` |
| 프롬프트 파일 | `pixel-v5.txt` | Spring 리소스 예정 |
| `reference_image_version` | `PIXEL_REF_V1` | `jar_ai_generations` |
| Reference 파일 | `pixel-reference-v1.png` | Spring 리소스 예정 |
| `postprocess_version` | `PIXEL_PP_V1` | `jar_ai_generations` |
| 픽셀 내부 해상도 | 48×48 | Java 후처리 |
| 목표 색상 수 | 최대 16색 | Java 후처리 |
| 최종 후보 이미지 | 480×480 PNG | Private S3 |
| 확대 방식 | Nearest Neighbor, 10배 | Java 후처리 |

**예정되는 실제 프로젝트 리소스 경로:**

```
src/main/resources/ai/
├── prompts/
│   └── pixel-v5.txt
└── references/
    └── pixel-reference-v1.png
```

운영에 사용한 파일은 같은 버전명으로 덮어쓰지 않는다. 개선하면 `pixel-v6.txt`/`PIXEL_V6`, `pixel-reference-v2.png`/`PIXEL_REF_V2`, 혹은 `PIXEL_PP_V2`처럼 **새 버전**을 추가한다. 신규 Generation에는 실제로 사용한 버전 조합만 기록한다. 과거 Generation의 버전 기록을 소급 변경하지 않는다.

- `JarAiStyle.PIXEL`은 **서비스 스타일 ID**이고, 파일명 `pixel-v5.txt`는 **리소스 이름**이다.
- 운영 Java 코드에서 프롬프트 전문을 하드코딩하지 않고, 버전-리소스 매핑을 통해 로드한다.
- `PIXEL_PP_V1`을 완전히 재현하려면 축소 보간법, 팔레트 산출 알고리즘, 투명도 및 색 공간 처리를 실제 구현에서 명시하고, PoC 결과와 비교 시험해야 한다. **48/16/480 숫자만 같다고 Python PoC와 픽셀별 동일한 출력이 보장되는 것은 아니다.** 이 세부 알고리즘 선택은 구현 시 검증한다.

---

## 5. 원본 Canvas 업로드·검증·심사

```
React Canvas 480×480
    ↓ Canvas.toBlob('image/png')
multipart/form-data
    ↓
Spring Boot
    ↓ 권한·크기·실제 PNG 시그니처·이미지 디코딩·480×480 검사
    ↓ 원본 콘텐츠 심사(도구·실패 정책은 구현 전 결정)
Private S3에 서버가 생성한 고유 Key로 저장
    ↓
jar_design_drafts.original_s3_key 기록
```

- 기존 일반 첨부파일용 `FilePurpose.JAR`/Presigned 업로드에 무조건 합치지 않는다. **Canvas Blob → Spring → 검증 → Private S3 → Draft 생성**이 합의된 기본 방향이다.
- HTTP `Content-Type` 값만으로 유효한 PNG임을 인정하지 않는다. 디코더가 손상 이미지에 과도한 메모리를 쓰지 않도록 요청 바이트·픽셀 수 상한을 둔다.
- 정확한 PNG 최대 바이트 수, 이미지 콘텐츠 심사 기술·판정 기준·장애 시 처리 방식은 **미결정**이다. 구현 전에 확정·테스트한다.
- 부적절 콘텐츠 검사에 실패하거나 심사가 끝나지 않은 원본을 AI 변환 또는 ORIGINAL 최종화에 사용하지 않는다. 현재 Draft 스키마에 심사 상태 컬럼이 없으므로, 비동기 심사를 택하면 완료 여부를 안전하게 구별할 설계를 먼저 추가로 결정해야 한다.
- 원본은 Draft에서 불변이어야 한다. 새 그림을 그리면 **새 Draft**를 만든다. S3 원본 객체가 덮어써지지 않도록 고유 Key·쓰기 정책을 확인하고, 심사한 파일과 실제 AI에 전달하는 파일이 동일한 객체인지 검증한다.
- S3 업로드 성공 후 Draft INSERT 실패 시 그 요청의 객체만 보상 삭제한다. 장애로 보상이 누락될 가능성은 후속 정리 정책에서 다룬다.

---

## 6. Cloudflare FLUX.2 Klein 4B 입력: 공식 문서 확인 범위

**2026-09-16 기준 Cloudflare 공식 안내에서 확인한 사항:**

- 모델 식별자: `@cf/black-forest-labs/flux-2-klein-4b`.
- REST 호출은 `multipart/form-data`를 사용하며, `prompt`가 필요하다.
- 참조 이미지 필드는 `input_image_0`부터 `input_image_3`까지 지원한다. PIXEL에서 사용하는 **두 이미지 입력은 지원 범위에 포함**된다.
- 참조 이미지 **각각의 가로·세로가 512px 미만**이어야 한다. 480×480 Canvas 원본은 치수상 이 조건을 충족하지만, `pixel-reference-v1.png`의 실제 크기도 검사해야 한다.
- 모델의 `steps`는 4로 고정되므로 임의 값을 조정하는 설정을 추가하지 않는다.
- 출력 크기는 별도 요청 매개변수로 정할 수 있으나, PIXEL 후보 최종 해상도 480×480은 **Java 후처리 출력 계약**이지 Cloudflare Raw 이미지가 자동으로 480×480이라는 뜻이 아니다.

**자료:** Cloudflare FLUX.2 Klein 4B 공식 변경 공지, Cloudflare 모델 문서.

### PIXEL 요청의 역할 분리

```
input_image_0 : 검증·승인된 Draft 원본 PNG
input_image_1 : 버전이 고정된 PIXEL 전용 Reference PNG
prompt       : PIXEL_V5 파일의 정확한 텍스트
seed         : 전달하기로 결정했다면 실제 전달한 값, 아니면 생략
```

**주의:** 위 필드명과 다중 이미지 지원은 공식 문서상 확인되었지만, 사용자 계정의 실제 모델 이용 가능 여부, 운영 토큰·권한, Java multipart 직렬화, 오류 응답·이미지 디코딩까지 **현재 프로젝트로 통합 테스트한 것은 아니다**. 구현 시 운영에 사용할 방식으로 요청·응답을 검증한다. PoC에 적은 `input 0/1`은 역할 설명이며, 실제 입력 파일 순서를 뒤집지 않는다.

`seed`는 DB에서 NULL 허용이다. 요청마다 임의의 seed를 사용하기로 구현했다면 **실제로 요청에 넣은 값만** 기록하고, 모델이 반환하지 않은 값을 사후에 추측해서 채우지 않는다. 같은 seed라도 모델·프롬프트·입력 및 공급자 구현이 바뀌면 결과가 동일하다고 보장하지 않는다.

---

## 7. Java `PixelPostProcessor` 설계

**운영에는 Python/Pillow/FastAPI/별도 GPU 서버를 추가하지 않는다.** Windows PoC의 원리를 기존 Spring Boot 내부 Java 후처리로 옮긴다.

```
Cloudflare Raw 이미지 응답
    ↓ 응답 형태·바이트·용량 확인
이미지 디코딩
    ↓
48 × 48로 축소
    ↓
최대 16색 팔레트로 양자화
    ↓
Nearest Neighbor로 10배 확대
    ↓
480 × 480 PNG 인코딩
    ↓ 최종 디코딩·크기·형식·용량 확인
Private S3 저장
```

### 구현 계약과 세부 검증

1. 이미지 입력은 실제 바이트를 검사하고 디코딩 실패·비정상적인 치수·과도한 용량을 거절한다.
2. 48×48 축소의 보간법을 지정하고 PoC 기준 이미지와 육안·픽셀 단위 비교를 수행한다.
3. **16색은 단순히 RGB 채널을 16단계로 나누는 것과 다르다.** 결과 이미지에 사용되는 전체 팔레트 색상을 최대 16개로 만드는 양자화 알고리즘을 정해야 한다. 직접 구현 또는 검증한 Java 라이브러리 사용 여부는 구현 단계에서 결정한다.
4. 투명도 보존·밝은 배경 처리와 팔레트에 투명 색을 포함할지 여부는 실제 결과 및 UI 조건을 보고 결정한다.
5. 48×48의 각 픽셀을 최근접 방식으로 10×10 블록으로 확대해 480×480을 만든다. 확대 단계에서 흐림 보간을 사용하지 않는다.
6. 최종 이미지가 480×480 PNG인지 확인한 뒤 S3에 저장한다.
7. Java 후처리를 완료하기 전에는 `PIXEL_PP_V1`이 운영에서 검증되었다고 표현하지 않는다.

### 개념 코드 — 구현 완료 코드 아님

```java
/**
 * AI가 생성한 이미지를 PIXEL_PP_V1 규칙의 후보 이미지로 가공하는 개념 예시.
 * resizeTo48/quantizeTo16Colors/resizeNearestNeighbor는 설계상의 책임을
 * 나타내며, 실제 메서드나 구현 완료된 클래스가 아니다.
 */
public BufferedImage process(BufferedImage source) {
    // 원본을 내부 스프라이트 해상도로 축소한다.
    BufferedImage small = resizeTo48(source);

    // 이미지 전체 팔레트를 최대 16색으로 제한한다.
    BufferedImage quantized = quantizeTo16Colors(small);

    // 픽셀 경계가 흐려지지 않도록 480x480으로 최근접 확대한다.
    return resizeNearestNeighbor(quantized, 480, 480);
}
```

`JarAiStyle`에 `requiresPostProcessing` 같은 플래그를 둘 수 있지만 **예시 설계**다. 실제 enum/전략 클래스는 마스터 구현 순서의 Enum 단계에서 최신 프로젝트 패키지를 확인해 결정한다. 현재 확정된 6개 스타일 ID는 `CUTE_2D`, `SOFT_25D`, `WATERCOLOR`, `HAND_DRAWN`, `WEIRDO`, `PIXEL`이며 PIXEL에만 후처리가 있다.

---

## 8. Generation 생성과 DB 상태 계약

`jar_ai_generations`의 상세 17개 컬럼·CHECK·FK는 `docs/ai/AI_ERD.md`가 기준이다. 아래는 PIXEL에서 사용하는 필드와 상태 전이의 요약이다.

```
generation_id           : 새로운 AI 생성 시도 ID
draft_id                : 소속 Draft ID (jar_id 아님)
ai_style                : PIXEL
status                  : PROCESSING
ai_provider             : CLOUDFLARE_WORKERS_AI
ai_model                : @cf/black-forest-labs/flux-2-klein-4b
prompt_version          : PIXEL_V5
reference_image_version : PIXEL_REF_V1
postprocess_version     : PIXEL_PP_V1
seed                    : 실제 전송한 값 또는 NULL
generated_s3_key        : 생성 시작 시 NULL
completed_at            : 생성 시작 시 NULL
```

새로 생성하는 시도마다 별도 Generation 행을 만든다. 이전 성공 후보나 실패 기록을 덮어쓰지 않는다. 실패가 발생하면 **해당 PROCESSING 행을 FAILED로 변경**하는 것이며, 실패 건마다 새 FAILED 행을 따로 생성하지 않는다.

### 상태별 주요 불변식

| 상태 | 후보 S3 Key | 완료 시각 | 에러 코드 | 참고 |
| --- | --- | --- | --- | --- |
| PROCESSING | NULL | NULL | NULL | 아직 최종 후보 없음 |
| SUCCEEDED | NOT NULL | NOT NULL | NULL | 결과 검증·S3 저장 완료 후에만 가능 |
| FAILED | NULL | NOT NULL | NOT NULL | 원인 코드 기록, 과거 후보 유지 |

`SUCCEEDED`의 `s3_deleted_at`은 임시 후보를 **나중에 실제로 삭제한 경우** 기록할 수 있다. 값이 NULL이라는 것만으로 S3 파일의 실재가 보장되지는 않는다.

실패 코드 예시: `SOURCE_IMAGE_LOAD_FAILED`, `PROVIDER_REQUEST_FAILED`, `PROVIDER_TIMEOUT`, `PROVIDER_RATE_LIMITED`, `PROVIDER_INVALID_RESPONSE`, `PIXEL_POSTPROCESS_FAILED`, `S3_UPLOAD_FAILED`, `GENERATION_TIMEOUT`, `INTERNAL_ERROR`.

---

## 9. 동시 생성·긴 트랜잭션 방지·늦은 응답

### 시작 트랜잭션

```
짧은 DB Tx
  → Draft 행 잠금
  → OWNER / ACTIVE / expires_at > now 확인
  → 같은 Draft의 PROCESSING Generation 존재 여부 확인
  → 없다면 새 PROCESSING Generation INSERT
COMMIT
```

한 Draft에서 **어느 AI 스타일이든** 동시에 PROCESSING Generation은 1건만 허용한다. PIXEL끼리만 제한하는 것이 아니다. Frontend 버튼 비활성화는 보조 수단이며 Backend 검증이 최종 방어다.

### 외부 작업: DB 트랜잭션 밖

```
S3 원본 로드
→ Cloudflare 호출
→ PIXEL Java 후처리
→ 결과 검증
→ 후보 Private S3 업로드
```

### 완료 트랜잭션

```
짧은 DB Tx
  → 같은 Draft 행을 다시 조정 지점으로 잠금
  → Generation이 여전히 PROCESSING인지 확인
  → Draft가 ACTIVE·비만료이고 작업이 아직 유효한지 확인
  → SUCCEEDED + generated_s3_key + completed_at 반영
COMMIT
```

Cloudflare 요청 중에 Draft가 만료·종료되거나 Scheduler가 Generation을 Timeout 처리할 수 있다. **늦게 도착한 성공 응답이 FAILED를 SUCCEEDED로 되돌리면 안 된다.** 저장한 후보 객체가 사용 불가능해졌다면 해당 요청의 S3 객체를 안전하게 정리한다.

- `PROCESSING`이 10분 이상 지속되면 `GENERATION_TIMEOUT`으로 FAILED 처리하는 것이 v1 설계다. Timeout·AI 완료·Draft 종료는 같은 Draft를 조정 지점으로 삼아 경쟁 상태를 검사한다.
- **미결정:** PROCESSING 도중 사용자 취소/DEFAULT·ORIGINAL·AI 최종화를 즉시 허용할지 여부. AI_ERD의 제안을 이미 확정된 정책처럼 구현하지 않는다. 이 경합 정책을 확정한 뒤 테스트한다.
- 사용자·서비스별 하루 고정 생성 횟수 제한은 현재 v1 정책에 없다. 공급자의 사용량 한도/429 대응·운영 모니터링과는 별개다.

---

## 10. 이미지 저장·조회·정리

### 임시 S3 Key — **서버 생성 예시**

```
jar-design-drafts/{ownerId}/{draftUuid}/original.png
jar-design-drafts/{ownerId}/{draftUuid}/ai/{generationId}.png
```

### 영구 S3 Key — **서버 생성 예시**

```
jar-designs/{ownerId}/{uuid}/final.png
```

위 경로는 구조를 설명하는 예시다. 실제 키 생성 방식·중복 방지·버킷 설정은 구현 단계에서 정한다. 클라이언트가 임의의 S3 Key를 제출해 타인의 이미지를 선택하거나 덮어쓰게 해서는 안 된다.

- `jar_ai_generations.generated_s3_key`에는 **후처리 완료된 PIXEL 후보**의 비공개 S3 Key만 저장한다. Presigned URL·Public URL은 DB에 저장하지 않는다.
- v1은 Cloudflare Raw 결과를 별도 영구 S3 객체나 `raw_result_s3_key` 컬럼으로 저장하지 않는다. 장애 분석 로그에도 이미지 원문·민감정보가 무분별하게 남지 않도록 한다.
- Draft OWNER가 후보 조회를 요청하면 권한을 확인한 뒤 짧은 수명의 Presigned GET URL을 발급한다. 이미 발급한 URL의 즉시 철회까지 보장하지 않는다.
- `FINALIZED`·`ABANDONED`·`EXPIRED` Draft의 임시 원본·후보는 정리 대상이다. 생성 기록은 DB에 유지하며, 후보 삭제 성공 후 해당 Generation의 `s3_deleted_at`을 기록한다.
- 원본에는 별도의 삭제 시각 컬럼이 없으므로 후보 `s3_deleted_at`을 원본 삭제 시각으로 오용하지 않는다.
- **복사 중 객체와 정리 작업의 경합 해결 방식은 미결정**이다. 정리 직전 DB 참조를 재확인하되, 조회 직후 복사가 시작되는 상황까지 막을 보호 전략(유예 시간/작업 상태 조정 등)을 구현·시험한 뒤 삭제한다. 영구 객체는 단순 TTL로 지우지 않는다.
- 기존 일반 `file_uploads`·`note_attachments` 테이블의 URL 정책까지 이 AI 문서가 변경하는 것은 아니다.

---

## 11. 후보 선택 → Slot → Finalize

PIXEL 후보 생성에 성공해도 `JarDesign`을 즉시 만들지 않는다.

```
ORIGINAL / 일반 AI / PIXEL 후보 목록
    ↓ 유효한 ACTIVE Draft에서 원하는 PIXEL 선택
Draft.selected_design_type = AI
Draft.selected_generation_id = 선택한 PIXEL Generation ID
    ↓
Slot Editor: 위치 + 크기
    ↓
최종 미리보기
    ↓ [저금통 만들기]
영구 S3 객체 준비
    ↓
짧은 DB Tx: 기존 Jar 생성 핵심 로직 재사용
    + jar_designs(design_type=AI, selected_generation_id=..., final_s3_key=...)
    + Draft FINALIZED(finalized_jar_id=...)
```

### Slot 계약

- `slot_center_x`, `slot_center_y`: **실제로 렌더링되는 이미지 영역 기준** 0~1 정규화 중심 좌표.
- `slot_size_ratio`: 0~1로 저장되는 **크기 슬라이더의 정규화 값**. 실제 이미지 너비에 곧장 곱하는 비율로 가정하지 않는다.
- Slot은 AI 프롬프트에 넣거나 PNG에 합성하지 않는다. React Overlay로 표시한다.
- Slot의 실제 너비·높이까지 고려해 이미지 밖으로 벗어나지 않는지 검증한다.
- 픽셀 확대/축소 환경에서 Slot 위치와 기존 이미지 표시가 정확한지 확인한다.
- Jar가 생성된 뒤 이미지·선택 후보·Slot을 변경하지 않는다.

### 최종화 동시성·정합성

- 영구 S3 복사 전 OWNER·Draft ACTIVE/비만료·선택 Generation `SUCCEEDED`·S3 실재를 확인한다.
- 복사 후 **Draft를 다시 잠그고 선택 후보·Slot·상태가 그대로인지 재확인**한다. 바뀌었다면 복사본을 잘못된 선택으로 확정하지 않는다.
- 기존 Jar OWNER 멤버십 등 생성 로직과 JarDesign INSERT, Draft FINALIZED를 **하나의 DB 트랜잭션**에 묶는다.
- DB 롤백 시 그 요청이 만든 영구 객체만 보상 정리한다. 응답 유실 후 재요청으로 Jar가 중복 생성되지 않도록 처리한다.
- `JarDesign` 행은 있으나 영구 S3 객체가 없거나 읽기에 실패한다면 **DEFAULT Jar로 오인하지 않고** 오류·복구 대상으로 다룬다.
- 최종화 시 원본/후보의 콘텐츠 검사 및 접근 권한을 우회하지 않는다.

정확한 복합 FK·CHECK·멱등성·S3 정리와 미결정 정책은 `docs/ai/AI_ERD.md`가 상세 기준이다.

---

## 12. 기존 Jar·프론트 표시 기능 보존

| 경우 | 새 AI 테이블 상태 | 표시 |
| --- | --- | --- |
| 처음부터 DEFAULT | Draft/Generation/JarDesign 없음 | 기존 Theme/CSS Jar |
| 직접 그리다가 DEFAULT | Draft FINALIZED, JarDesign 없음 | 기존 Theme/CSS Jar |
| ORIGINAL 최종화 | Draft FINALIZED + JarDesign ORIGINAL | 영구 원본 + Slot |
| PIXEL 최종화 | Draft FINALIZED + 성공 Generation + JarDesign AI | 영구 PIXEL + Slot |

기존 Jar의 테마·오픈·쪽지 넣기·파티클·확대·온보딩·목록 기능을 제거하거나 화면 전체를 교체하지 않는다. `JarsPage`, `JarDetailPage`, `JarZoomModal`, `JarOpenCelebrationModal` 등 **실제 최신 코드의 모든 Jar 표시 위치**를 다시 찾아 Optional JarDesign으로 분기한다. 정확한 React Route/컴포넌트 파일 구성은 구현 직전 확인한다.

---

## 13. 마스터 24단계와 PIXEL 작업의 관계

PIXEL 문서가 별도 구현 순서 20단계를 제시하면, 전체 AI 계획의 **고정된 24단계**와 작업 번호가 충돌한다. PIXEL은 아래 마스터 단계 **안에서** 구현한다.

| 마스터 단계 | PIXEL 관련 작업 |
| --- | --- |
| 1. 정책/Prompt 확정 | PIXEL_V5·PIXEL_REF_V1·PIXEL_PP_V1 및 버전 리소스 계약 |
| 2. UX/권한 정책 | OWNER 전용 Draft 생성·PIXEL 후보 선택·Slot 규칙 |
| 3. 논리 ERD 확정 | Draft/Generation/JarDesign 관계와 설계 상태 기록 |
| **4. FK/CHECK/INDEX 최종 SQL** | 현재 다음 작업. SQL 물리 검증, 동시성·복합 FK·S3 Key 정책 미결정 확인 |
| 5. Flyway | 실제 최신 번호 확인 후 신규 마이그레이션 |
| 6~8. Enum/Entity/Repository | 스타일·Generation·Draft 및 조회·락 |
| 9~10. 원본 업로드/Draft Service | 실제 PNG·심사·Private S3·소유권 |
| 11. Cloudflare Client | PIXEL 두 이미지·multipart·응답 계약 |
| 12. AI Generation Service | PROCESSING, Cloudflare, 결과 검증, 후보 S3 |
| **13. PIXEL Java 후처리** | 48×48·최대 16색·최근접 480×480 구현·PoC 비교 |
| 14~15. stale/cleanup·Finalize | Timeout·임시 객체 보호·최종 복사·JarDesign 생성 |
| 16~17. API/DTO/Controller·Backend Test | Draft 기반 API, 실패·권한·경합·이미지 검사 |
| 18~22. Canvas·후보·Slot·미리보기 | 기존 UI 보존, PIXEL 후보 UX |
| 23. 기존 Jar 표시 지점 연결 | Optional JarDesign, 이미지 누락 오류 분리 |
| 24. 통합 테스트/배포/Smoke Test/문서화 | 운영 계정·S3·DB·Cloudflare 연동 확인 |

**현재 위치는 3번 논리 설계 정리 완료, 다음 4번 최종 SQL 검토**다. 앞 단계를 완료했다고 적는 것은 *설계 결정*에 대한 표시이며, Java/React/Flyway 배포가 끝났다는 뜻이 아니다. 신규 Flyway 번호를 미리 `V32`로 고정하지 않고 실제 구현 시 최신 마이그레이션을 확인한다. 과거 마이그레이션은 수정하지 않는다.

---

## 14. 구현 전에 반드시 확인할 항목

### 외부 연동·리소스

- [ ]  `pixel-reference-v1.png`가 실제 파일로 준비되어 있고 가로·세로가 각각 512px 미만인지 검사.
- [ ]  픽셀 원본과 Reference를 `input_image_0`/`input_image_1`로 보냈을 때 실제 운영에 사용할 REST 요청·응답이 정상인지 확인.
- [ ]  Cloudflare 인증·429·Timeout·손상된 응답·허용 용량·비정상 치수를 재현.
- [ ]  실제 전송한 Prompt/Reference/후처리 버전 및 선택적 seed만 DB에 저장.
- [ ]  운영 리소스가 한번 사용된 후 바뀌지 않으며 새 버전만 추가되는지 확인.

### 이미지·권한·S3

- [ ]  480×480 원본 PNG의 형식·디코딩·용량 및 **별도 콘텐츠 심사**를 통과하지 못하면 AI/ORIGINAL 최종화 거절.
- [ ]  심사 미완료를 승인된 Draft로 취급하지 않도록 상태 설계 및 장애 정책 확정.
- [ ]  Java 48/16/480 출력이 PoC와 시각적으로 일치하는지 검증하고 실제 적용한 양자화·알파 처리 규칙을 기록.
- [ ]  후보·영구 이미지는 Private S3에 저장, URL은 권한 확인 후 단기 발급.
- [ ]  타인의 Draft/Generation/임의 S3 Key 선택·복사·조회가 불가능한지 확인.
- [ ]  S3 객체 덮어쓰기 금지 및 원본 심사 파일과 AI 입력 객체의 동일성 확인.
- [ ]  임시 파일 정리와 AI 원본 로드·Finalize 복사가 겹쳐도 사용 중인 객체가 지워지지 않도록 보호 방식 결정·시험.
- [ ]  영구 이미지 누락이 DEFAULT Jar로 잘못 처리되지 않는지 확인.

### 상태·트랜잭션·기존 기능

- [ ]  Draft당 어느 스타일이든 PROCESSING 1건만 허용.
- [ ]  Timeout 후 늦은 성공이 FAILED를 SUCCEEDED로 바꾸지 못함.
- [ ]  PROCESSING 도중 취소·최종화 허용 여부를 결정하고 경합 테스트.
- [ ]  후보 선택 변경과 영구 S3 복사가 경합할 때 다른 후보가 최종화되지 않음.
- [ ]  동시 Finalize 두 번/응답 유실 재요청에도 Jar 중복 생성되지 않음.
- [ ]  ORIGINAL/AI/DEFAULT 최종화가 AI_ERD의 값 조합과 일치함.
- [ ]  기존 기본 Jar 생성·회원 권한·오픈·쪽지·채팅 및 모바일 UI가 그대로 동작.

---

## 15. 폐기한 구조와 최종 원칙

**폐기:** Jar 생성 후 AI 생성·Apply·Revert, `jars.active_ai_generation_id`, `jar_ai_generations.jar_id`, Generation의 `created_by`/`source_upload_id`/`generated_url`, AI가 그리는 Coin Slot, PIXEL에 BASE 적용, 모든 스타일 공통 Reference, JarTheme 강제 재칠하기, Python/Pillow 운영 서비스, 별도 20단계 마스터 일정.

**최종 원칙:**

1. **PIXEL은 Jar 생성 전 Draft에 보관하는 AI 후보**다.
2. **원본은 검증·심사 후 사용하며, PIXEL은 버전 고정된 Prompt/Reference를 활용하고 Java에서 후처리한다.**
3. **AI 응답 수신만으로 성공 처리하지 않는다.** 검증·후처리·Private S3 저장·유효한 DB 상태 전이까지 완료해야 한다.
4. **후보 선택 → React Slot Overlay → 최종 Jar 생성**이 마지막 단계다.
5. **기존 기본 Jar는 기존 기능 그대로**, 신규 커스텀 디자인은 선택적 JarDesign으로 표시한다.

---

## 참고 문서

- 프로젝트 내부: `docs/ai/AI_DESIGN_PLAN.md` — 24단계 전체 개발 순서와 정책.
- 프로젝트 내부: `docs/ai/AI_ERD.md` — 3개 신규 테이블 및 상태·FK·동시성·S3 데이터 계약.
- 프로젝트 내부: `docs/ai/AI_DESIGN_RULES.md` — 각 스타일의 원본 보존·Prompt/Reference·버전 규칙.
- 외부 공식: Cloudflare Workers AI FLUX.2 Klein 4B 모델.
- 외부 공식: Cloudflare FLUX.2 Klein 4B 출시 및 다중 참조 입력 형식.

**현재 문서는 설계 정리본이다. 소스·운영 DB·Cloudflare 서비스에 변경을 적용하거나 테스트를 실제로 수행한 기록은 아니다.**