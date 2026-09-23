먼저 바뀐 부분을 정확히 짚고, 그 아래에 **노션에 그대로 교체할 수 있는 최종본**으로 정리할게.

## 먼저, 지금 방향과 다른 부분

| 기존 문서 | 현재 최종 방향 |
| --- | --- |
| OWNER / ADMIN AI 생성 가능 | **OWNER만 가능** |
| AI가 그림을 “저금통으로 변환” | ❌ 저금통 형태 강제 안 함 |
| AI가 coin slot 생성 | ❌ AI는 Slot 생성 안 함 |
| `narrow horizontal coin slot` 프롬프트 | ❌ 완전히 제거 |
| JarTheme 색상을 AI Prompt에 적용 | ❌ Theme과 AI 디자인 분리 |
| 필요 시 공통 Memory Jar Reference | ❌ 공통 Reference 없음. **PIXEL만 전용 Reference** |
| `AI_JAR_SKETCH` + 기존 Presign 흐름 | 현재 기본 방향은 **Canvas Blob → Spring → 검증 → Private S3 → Draft 생성** |
| AI 생성 시 이미 `jar_id` 존재 | ❌ AI 생성 시점에는 아직 Jar가 없음 |
| `jar_ai_generations.jar_id` | ❌ `draft_id` |
| `created_by` | ❌ 제거. `generation → draft → owner`로 확인 |
| `source_upload_id` | ❌ 현재 Draft의 `original_s3_key` 사용 |
| `generated_url` DB 저장 | ❌ URL 저장 안 함. `generated_s3_key`만 저장 |
| `jars.active_ai_generation_id` | ❌ 완전히 제거 |
| 생성(generate) / 적용(apply) API | ❌ apply 구조 폐기 |
| Jar 생성 후 AI 디자인 적용/교체 | ❌ Jar 생성 후 디자인 변경 불가 |
| 같은 Jar에서 PROCESSING 방지 | **같은 Draft에서 PROCESSING 1건만 허용** |
| 60회/일 MVP 제한 후보 | ❌ 현재 사용자/서비스 횟수 제한 없음 |
| AI 후보 영구 사용자 히스토리 | Jar 생성 전 후보 보관. 이후 DB 이력은 유지하되 임시 S3는 정리 가능 |
| 기존 Jar도 새 AI DB 구조 적용 | ❌ 기존 Jar는 기존 코드 그대로 |
| 직접 그리다 기본 Jar 선택 | Draft `FINALIZED`, JarDesign 없음 |

그리고 PoC에서 발견했던 문제 중에서도:

```
coin slot 모양이 이상함
→ Prompt 개선
```

은 이제 고칠 문제가 아니야.

최종 설계에서는:

> **AI에게 Slot 자체를 그리게 하지 않는다.**
>

로 문제를 구조적으로 제거했으니까.

---

# 🎨 Memory Jar AI — 기술 방향 및 PoC 결과 최종 정리 v1

## 1. 최종 기술 선택

| 역할 | 최종 선택 |
| --- | --- |
| 프론트 | 기존 **React 19.2.4** |
| 그림판 | **HTML Canvas + React** |
| Canvas 내부 해상도 | **480 × 480** |
| 메인 백엔드 | **Spring Boot 3.5.10 / Java 17** |
| AI 플랫폼 | **Cloudflare Workers AI REST API** |
| 이미지 AI | **`@cf/black-forest-labs/flux-2-klein-4b`** |
| 일반 AI 입력 | 사용자 원본 그림 |
| PIXEL 입력 | 사용자 원본 + Pixel Reference |
| 원본 이미지 저장 | **AWS S3 Private** |
| AI 후보 이미지 | **AWS S3 Private** |
| 최종 커스텀 이미지 | **AWS S3 Private** |
| DB | **MariaDB 10.11** |
| DB 변경 | 기존 **Flyway** |
| Python | 운영 사용 ❌ |
| FastAPI | ❌ |
| 별도 GPU 서버 | ❌ |
| 별도 AI 서버 | ❌ |
| AI 호출 주체 | **Spring Boot → Cloudflare 직접 호출** |
| AI 디자인 제작 권한 | **Draft OWNER만** |
| 사용자 생성 횟수 제한 | v1에서는 없음 |
| 동시 AI 생성 | **Draft당 1건** |
| Jar 생성 후 디자인 변경 | ❌ 불가 |

---

# 2. Flyway 번호는 미리 `V32`로 고정하지 않는다

기존 문서의:

```
다음 버전 = V32
```

는 구현 시점에 그대로 믿지 않는다.

실제 구현 직전에 최신 코드의:

```
src/main/resources/db/migration
```

을 확인해서 **현재 마지막 Migration 다음 번호**를 사용한다.

즉 원칙은:

```
기존 Migration 수정 ❌
새 Migration 추가 ✅
```

이다.

---

# 3. 전체 AI 디자인 구조

예전 구조:

```
Jar 생성
↓
AI 생성
↓
미리보기
↓
apply
↓
jars.active_ai_generation_id 변경
```

이 구조는 폐기한다.

최종 구조:

```
저금통 만들기
│
├─ 기본 저금통
│    ↓
│  기존 Jar 생성 로직 그대로
│
└─ 직접 그리기
     ↓
   Canvas
     ↓
 [그림 완성]
     ↓
 Private S3
     ↓
 jar_design_drafts
     ↓
 ┌────────────────────────┐
 │ 원본 그대로            │
 │ AI로 꾸며보기           │
 │ 기본 저금통으로 돌아가기 │
 └────────────────────────┘
     ↓
 AI 사용 시
 jar_ai_generations
     ↓
 여러 후보 누적
     ↓
 최종 후보 선택
     ↓
 Slot 위치/크기 설정
     ↓
 최종 미리보기
     ↓
 Jar 생성
     ↓
 ORIGINAL / AI이면
 jar_designs 생성
     ↓
 Draft FINALIZED
```

---

# 4. 기존 기본 Jar는 그대로 둔다

처음부터:

```
🫙 기본 저금통 사용
```

을 선택했다면 현재 잘 돌아가는 기존 Jar 생성 코드를 그대로 사용한다.

```
기존 Jar 생성 로직
↓
jars INSERT
↓
완료
```

이 경우:

```
jar_design_drafts ❌
jar_ai_generations ❌
jar_designs ❌
```

이다.

즉 AI 기능 때문에 기존 정상 기능을 새 구조에 억지로 집어넣지 않는다.

---

# 5. 직접 그리다 기본 Jar로 돌아가도 된다

예:

```
직접 그리기
↓
Draft 생성
↓
귀여운 2D도 만들어봄
↓
PIXEL도 만들어봄
↓
마음에 안 듦
↓
기본 저금통 사용
```

이때는 기존 Jar 생성 핵심 로직을 재사용한다.

```
jars 생성 ✅
jar_designs 생성 ❌
```

Draft:

```
selected_design_type = DEFAULT
selected_generation_id = NULL

slot_center_x = NULL
slot_center_y = NULL
slot_size_ratio = NULL

status = FINALIZED
finalized_jar_id = 생성된 Jar ID
```

이 Draft는:

```
ABANDONED ❌
FINALIZED ✅
```

이다.

정상적으로 Jar 생성을 끝낸 것이기 때문이다.

---

# 6. JarTheme과 AI 디자인은 분리

기존 문서의:

```
SPRING
SUMMER
AUTUMN
WINTER
LAVENDER
DEW
SAND
MOONLIGHT

→ AI Prompt 색감에도 활용
```

은 폐기한다.

최종적으로:

```
JarTheme
→ 페이지 배경/UI/분위기

AI 디자인
→ 실제 사용자 커스텀 이미지
```

로 분리한다.

따라서:

```
Theme에 맞춰 AI 색상 강제 변경 ❌
Theme별 AI Prompt Mapping ❌
```

이다.

원본의 색상을 최대한 유지한다.

---

# 7. AI가 저금통 모양을 강제 생성하지 않는다

PoC 초기 목표였던:

```
사용자 그림
↓
그림 실루엣 자체를 저금통 몸체로 변환
```

방향 역시 최종적으로 변경했다.

현재 원칙은:

> **사용자의 그림을 선택한 스타일로 표현하되 저금통 형태로 강제하지 않는다.**
>

즉:

```
원본 실루엣/구성/방향/비대칭 보존
+
선택 Style 적용
```

이 핵심이다.

---

# 8. AI는 동전 투입구를 만들지 않는다

초기 PoC에서는:

```
narrow horizontal coin slot
```

같은 Prompt를 사용했다.

이제는 전부 제거한다.

```
AI coin slot 생성 ❌
```

최종 디자인을 선택한 뒤 React에서:

```
slot_center_x
slot_center_y
slot_size_ratio
```

를 이용해 Slot을 Overlay한다.

---

# 9. Canvas 원본 업로드

v1 기본 흐름:

```
Canvas
↓
[그림 완성]
↓
Canvas.toBlob()
↓
multipart/form-data
↓
Spring Boot
↓
이미지 검증
↓
Private S3
↓
jar_design_drafts 생성
```

즉 기존 `FilePurpose.JAR`에 억지로 끼워 넣지 않는다.

또한 현재 최종 구조에서는 **반드시 Presigned Upload + `AI_JAR_SKETCH`를 써야 한다고 고정하지도 않는다.**

우선은 Draft 생성 Service가:

```
원본 업로드
+
검증
+
S3 저장
+
Draft 생성
```

을 한 흐름으로 책임지는 구조가 더 자연스럽다.

---

# 10. Canvas 이미지 검증

`Content-Type: image/png` 문자열만 믿지 않는다.

Spring에서 실제 bytes를 읽고 이미지 Decode 가능 여부를 검증한다.

확인 항목 예:

```
PNG 형식인가?
실제 이미지 Decode 가능한가?
480 × 480인가?
허용 용량 이하인가?
```

잘못된 파일이면 Cloudflare로 보내지 않는다.

정확한 최대 파일 크기는 구현 단계에서 최종 상수로 확정한다.

---

# 11. 공통 Reference 이미지는 없다

예전:

```
사용자 스케치
+
Memory Jar 스타일 Reference
```

구조는 사용하지 않는다.

최종:

```
CUTE_2D
→ 사용자 원본만

SOFT_25D
→ 사용자 원본만

WATERCOLOR
→ 사용자 원본만

HAND_DRAWN
→ 사용자 원본만

WEIRDO
→ 사용자 원본만

PIXEL
→ 사용자 원본
  + PIXEL 전용 Reference
```

이다.

---

# 12. PIXEL Reference

PIXEL만:

```
input_image_0 = 사용자 원본

input_image_1
= pixel-reference-v1.png
```

를 사용한다.

Reference:

```
PIXEL_REF_V1
```

으로 버전 관리한다.

파일:

```
src/main/resources/ai/references/
└─ pixel-reference-v1.png
```

운영에 사용된 V1을 나중에 덮어쓰지 않는다.

---

# 13. Prompt 구조

현재:

```
🌸 CUTE_2D
→ BASE + CUTE_2D

🧸 SOFT_25D
→ BASE + SOFT_2_5D

🎨 WATERCOLOR
→ BASE + WATERCOLOR

✏️ HAND_DRAWN
→ BASE + HAND_DRAWN

😜 WEIRDO
→ FUNNY_CHARACTER_UNIVERSAL
  + FUNNY_CHARACTER_CRAZY_BOOST
→ BASE 사용 안 함

🟪 PIXEL
→ PIXEL_V5
→ BASE 사용 안 함
```

이다.

---

# 14. Prompt 버전 관리

Generation마다:

```
prompt_version
```

을 저장한다.

예:

```
BASE_V1+CUTE_2D_V1
```

또는:

```
FUNNY_UNIVERSAL_V1+FUNNY_CRAZY_BOOST_V1
```

PIXEL:

```
PIXEL_V5
```

운영에 사용한 Prompt 파일을 나중에 수정하지 않는다.

```
v1 덮어쓰기 ❌
v2 새 파일 ✅
```

---

# 15. Pixel 후처리

PoC:

```
Python
+
Pillow
```

는 검증용으로만 사용한다.

운영:

```
Java PixelPostProcessor
```

로 옮긴다.

`PIXEL_PP_V1`:

```
Cloudflare Raw 이미지
↓
64 × 64 bilinear 축소
↓
최대 24색 median-cut 팔레트
↓
Nearest Neighbor
↓
480 × 480
```

---

# 16. DB 구조

최종적으로 새 테이블은 세 개다.

```
jar_design_drafts
jar_ai_generations
jar_designs
```

기존:

```
jars
```

에는 AI 컬럼을 추가하지 않는다.

---

# 17. `jar_ai_generations`의 핵심 변경

예전 문서:

```
generation_id
jar_id
created_by
source_upload_id
provider
model
prompt_version
status
seed
generated_s3_key
generated_url
...
```

최종:

```
generation_id
draft_id
ai_style
status
ai_provider
ai_model
prompt_version
seed
reference_image_version
postprocess_version
generated_s3_key
s3_deleted_at
error_code
error_message
created_at
completed_at
updated_at
```

### 삭제된 컬럼

```
jar_id ❌
created_by ❌
source_upload_id ❌
generated_url ❌
```

---

# 18. 왜 `jar_id`가 없는가?

AI 생성 시점에는 아직 Jar가 없다.

```
Draft
↓
AI 생성
↓
후보 비교
↓
최종 선택
↓
Jar 생성
```

이기 때문이다.

따라서:

```
jar_ai_generations.draft_id
```

로 연결한다.

관계:

```
Draft 1 : N Generation
```

이다.

---

# 19. 왜 `created_by`가 없는가?

이미:

```
Generation
↓
Draft
↓
owner_id
```

로 생성자를 알 수 있다.

동일 정보를:

```
generation.created_by
```

에 다시 저장하지 않는다.

---

# 20. 왜 `source_upload_id`가 없는가?

AI 원본은 해당 Draft의:

```
original_s3_key
```

로 고정되어 있다.

따라서 Generation마다 같은 원본 Upload ID를 반복 저장하지 않는다.

---

# 21. DB에 URL을 저장하지 않는다

예전:

```
generated_s3_key
generated_url
```

두 개 저장 ❌

최종:

```
generated_s3_key
```

하나만 저장한다.

필요할 때:

```
S3 Key
↓
Spring
↓
PreSigned GET URL
↓
React
```

로 처리한다.

---

# 22. `jars.active_ai_generation_id`는 완전히 폐기

다음 구조는 이제 사용하지 않는다.

```
jars.active_ai_generation_id
```

따라서:

```
AI 후보 #4 선택
↓
active_ai_generation_id = 4
```

같은 동작도 없다.

최종 Jar 생성 전에 Draft에서 후보를 고른다.

AI를 최종 선택했다면:

```
jar_designs.selected_generation_id
```

로 생성 출처만 영구 기록한다.

---

# 23. Generate / Apply 분리도 폐기

예전:

```
AI Generate
↓
Preview
↓
Apply
```

에서 `Apply`는 이미 존재하는 Jar 디자인을 변경하는 의미였다.

현재는:

```
Generate
↓
후보 보관
↓
최종 후보 선택
↓
Slot 설정
↓
Jar Finalize
```

이다.

따라서:

```
apply API ❌
기본 디자인 복구 API ❌
```

이다.

---

# 24. 후보 선택은 Draft 상태

최종 Jar가 생기기 전:

```
jar_design_drafts.selected_design_type
jar_design_drafts.selected_generation_id
```

로 현재 선택을 관리한다.

예:

```
selected_design_type = AI
selected_generation_id = 503
```

이다.

---

# 25. AI 결과는 즉시 Jar에 적용되지 않는다

이 원칙 자체는 이전 문서에서 맞았다.

다만 의미가 조금 달라졌다.

예전:

```
이미 존재하는 Jar에 Apply하기 전에 Preview
```

가 아니라,

현재:

```
아직 Jar 자체가 만들어지기 전
여러 후보를 Preview하고 최종 하나를 선택
```

이다.

---

# 26. Candidate 보관

예:

```
원본
귀여운 #1
귀여운 #2
수채화 #1
괴짜 #1
PIXEL #1
```

AI 결과마다 별도의 Generation Row를 만든다.

새 Generation이 기존 Generation을 덮어쓰지 않는다.

---

# 27. 동시 생성 방지

기준은:

```
같은 Jar ❌
같은 Draft ✅
```

이다.

```
Draft Lock
↓
Draft ACTIVE 확인
↓
PROCESSING Generation 존재 확인
↓
없을 때만 새로운 Generation 생성
```

Frontend 생성 버튼도 잠근다.

---

# 28. 생성 횟수 제한

PoC의 실측 Neuron 자료는 **역사적 측정 자료로 남겨도 된다.**

예:

```
PoC 당시
약 1.31k / 10k 사용
약 12회 생성
약 109 Neurons/회
```

같은 내용.

다만:

```
MVP 안전 한도 = 60회/일
```

을 현재 제품 정책으로 확정하지 않는다.

v1:

```
사용자별 고정 횟수 제한 없음
서비스 전체 고정 횟수 제한 없음
동시 요청 제한만 적용
```

이다.

실제 운영 사용량을 보고 나중에 환경설정 기반 제한을 추가한다.

---

# 29. Generation 상태

```
PROCESSING
SUCCEEDED
FAILED
```

SUCCEEDED는:

```
Cloudflare 성공
+
필요한 후처리 성공
+
S3 저장 성공
```

까지 끝난 상태다.

---

# 30. 오래된 PROCESSING 복구

서버 장애 등으로:

```
PROCESSING
```

이 남을 수 있다.

v1:

```
created_at 기준 10분 이상
↓
FAILED
↓
GENERATION_TIMEOUT
```

처리한다.

---

# 31. Cloudflare 호출 Transaction

다음처럼 긴 Transaction을 만들지 않는다.

```
BEGIN TX
↓
Cloudflare 기다림
↓
S3 작업
↓
COMMIT

❌
```

최종:

```
짧은 DB Tx
→ PROCESSING 생성
→ 종료

Cloudflare
Pixel 후처리
S3

짧은 DB Tx
→ SUCCEEDED / FAILED 업데이트
→ 종료
```

로 간다.

---

# 32. AI 결과 S3 경로

AI 생성 시점에는 `jarId`가 없으므로:

```
jars/ai-generated/{jarId}
```

는 사용하지 않는다.

추천:

```
jar-design-drafts/
└─ {ownerId}/
   └─ {draftUuid}/
      ├─ original.png
      └─ ai/
         ├─ 501.png
         ├─ 502.png
         └─ 503.png
```

이다.

---

# 33. 최종 선택 후 영구 이미지

ORIGINAL 또는 AI가 최종 선택되면 임시 이미지를 영구 영역으로 복사한다.

```
jar-designs/
└─ {ownerId}/
   └─ {uuid}/
      └─ final.png
```

그 Key를:

```
jar_designs.final_s3_key
```

에 저장한다.

---

# 34. `jar_designs`

`jar_designs`는 다음만 저장한다.

```
ORIGINAL
AI
```

DEFAULT Row는 만들지 않는다.

관계:

```
jars 1 : 0..1 jar_designs
```

이다.

---

# 35. 기존 Jar 판단

```
JarDesign 없음
→ 기존 기본 Jar
```

```
JarDesign 있음
→ 커스텀 ORIGINAL / AI Jar
```

이다.

따라서 기존 운영 Jar 데이터 Backfill도 필요 없다.

---

# 36. 최종 PoC 결과의 해석 수정

기존 PoC 점수와 이미지 결과는 그대로 역사 기록으로 보관해도 된다.

다만 발견한 문제의 **해석과 해결방법**은 지금 기준으로 바꾼다.

---

## 문제 ① 복잡한 그림 해석

초기 해석:

```
복잡한 그림이 저금통 몸체가 아니라 장식이 됨
```

최종 방향에서는 “반드시 저금통 몸체가 되어야 한다”는 요구 자체를 제거했다.

현재 해결 목표:

> 의미 있는 여러 인물·대상의 개수, 배치, 관계, 방향, 실루엣을 최대한 보존한다.
>

즉:

```
강제로 저금통 몸체화 ❌
원본 구성 보존 ✅
```

이다.

---

# 37. 문제 ② 불필요한 몸통·받침대

이 문제는 그대로 유효하다.

예:

```
별
+
뒤쪽 원통
+
받침대
```

같은 임의 구조는 금지한다.

Prompt 공통 규칙:

```
원본에 없는

받침대
프레임
원판
컨테이너
지지 구조

추가 금지
```

로 해결한다.

---

# 38. 문제 ③ 배경

최종 정책:

> 의미 있는 배경·풍경·장면·장식 배경을 생성하지 않는다.
>

가능하면 독립된 대상만 출력한다.

기술적으로 이미지 Canvas가 필요하다면:

```
빈 흰색
또는
밝은 중립 배경
```

정도만 허용한다.

완전한 투명 배경이 모델 출력만으로 안정적으로 보장되지 않는다면 별도 후처리는 실제 결과를 본 뒤 판단한다.

즉 처음부터 별도 배경 제거 서버를 추가하지 않는다.

---

# 39. 문제 ④ Coin Slot

이 문제는 **Prompt 튜닝 대상에서 완전히 제거**한다.

PoC에서는:

```
좁은 Slot이 아니라 구멍처럼 나옴
```

문제가 있었지만 해결 방법은:

```
더 강한 coin slot Prompt
```

가 아니다.

최종 해결:

```
AI가 Coin Slot 생성하지 않음
↓
최종 디자인 선택
↓
React Slot Editor
↓
사용자가 위치 + 크기 결정
```

이다.

따라서:

```
narrow horizontal coin slot
```

같은 문구도 최종 Prompt에서 제거한다.

---

# 40. 현재 PoC에서 최종적으로 얻은 것

PoC의 가치가 사라진 것은 아니다.

PoC를 통해 확인한 핵심은:

```
Cloudflare FLUX 호출 가능 ✅
사용자 그림 기반 생성 가능 ✅
다양한 스타일 실험 가능 ✅
색상/형태 보존 개선 가능 ✅
Pixel Reference 효과 확인 ✅
Pixel 후처리 효과 확인 ✅
무료 Neuron 사용량 실측 ✅
Spring에서 실제 운영 연동 가능 ✅
```

이다.

반대로 PoC 과정에서 폐기한 생각은:

```
모든 결과를 저금통 모양으로 강제 ❌
AI Coin Slot ❌
공통 Memory Jar Reference ❌
JarTheme recolor ❌
Jar 생성 후 AI Apply ❌
```

이다.

---

# 41. 최종 구현 기준

이 문서 이후 실제 구현은:

```
1. 최종 FK / CHECK / INDEX SQL 확정
↓
2. Flyway
↓
3. Enum
↓
4. Entity
↓
5. Repository
↓
6. Draft 원본 업로드
↓
7. Draft Service
↓
8. Cloudflare Properties / Client
↓
9. AI Generation Service
↓
10. Pixel Java PostProcessor
↓
11. stale / cleanup
↓
12. Finalize Service
↓
13. API / DTO / Controller
↓
14. Backend Test
↓
15. React Canvas
↓
16. 후보 보관함
↓
17. Slot Editor
↓
18. Final Preview / Finalize
↓
19. 기존 Jar 표시 지점 Optional JarDesign 연결
↓
20. 통합 테스트
↓
21. 배포
```

로 진행한다.

---

## 이 문서에서 특히 반드시 지워야 할 옛 문장

노션을 수정할 때 아래 내용이 남아 있으면 나중에 혼란이 생길 수 있으니 **완전히 삭제**하는 게 좋아.

```
OWNER / ADMIN AI 가능
```

→ OWNER만.

```
JarTheme 값을 AI 색감에 그대로 활용
```

→ 삭제.

```
사용자 스케치 + 필요 시 Memory Jar 공통 Reference
```

→ 삭제. Pixel만 Reference.

```
사용자 그림 실루엣 자체가 저금통 전체 몸체
```

→ 삭제.

```
coin slot Prompt
narrow horizontal coin slot
```

→ 삭제.

```
jar_ai_generations.jar_id
created_by
source_upload_id
generated_url
```

→ 삭제.

```
jars.active_ai_generation_id
```

→ 삭제.

```
생성(generate) / 적용(apply)
```

→ 기존 Jar 적용 개념으로는 삭제.

```
MVP 60회/일 제한
```

→ 제품 정책으로는 삭제.

---

이렇게 고치면 이 문서도 지금 우리가 확정한 **`Draft → Generation → 후보 → Slot → Finalize → Optional JarDesign` 구조와 완전히 맞아.** 특히 예전 PoC의 실험 결과는 살리면서, **그 실험에서 시작했던 낡은 “AI가 저금통과 동전 투입구까지 다 그린다”는 설계만 걷어내는 것**이 핵심이야.

---

1. **AI 디자인 규칙·프롬프트·Reference 리소스 실제 추가 및 Catalog 구현**
    - 버전 고정 프롬프트 파일 8개와 `pixel-reference-v1.png` 추가
    - 스타일별 조합과 `prompt_version`은 서버가 결정
    - 클라이언트는 prompt/version을 제출하지 않음

   🎨 Memory Jar AI 디자인 규칙 & 프롬프트 v1 — 최종본

   PIXEL 스타일 생성·Java 후처리·후보 저장·최종화 설계

2. **UX·권한 정책 최종 확정** ✅

   기본 Jar / 직접 그리기 / ORIGINAL / AI / DEFAULT 복귀 흐름 확정

   🎨 AI 기능 UX와 권한 정책 — 최종 v1

3. **DB ERD 최종 확정** ✅

   `jar_design_drafts` → `jar_ai_generations` → `jar_designs`, 그리고 기존 `jars`는 변경하지 않는 구조.

   AI_ERD 최종

4. **전체 FK / CHECK / INDEX 최종 SQL 작성**  ✅

   지금 대화에서 정한 제약조건을 실제 SQL 수준에서 한 번 검증한다.

5. **Flyway Migration 작성** ✅

   `jar_design_drafts` → `jar_ai_generations` → Draft의 Generation FK → `jar_designs` 순으로 만든다.

   기존 `jars.active_ai_generation_id`는 절대 추가하지 않는다.

   정확한 `V32` 여부는 최신 migration 번호를 실제 코드에서 확인하고 결정한다.

6. **Enum 구현** ✅

   `JarDraftStatus`, `JarDraftDesignType`, `JarAiStyle`, `JarAiGenerationStatus`, `JarAiProvider`, `JarAiGenerationErrorCode`, `JarDesignType` 등을 구현한다.

7. **Entity 구현** ✅

   Draft / Generation / Design Entity 및 관계 구현

8. **Repository 구현** ✅

   Draft lock 조회, PROCESSING 조회, 만료 Draft 조회 등 실제 Service에서 필요한 Query를 만든다.

9. **Draft 원본 이미지 업로드 + 검증 구현** ✅
    - Canvas PNG 검증 → Private S3 → Draft 생성
    - S3 성공·DB 실패 보상 삭제 포함
10. **외부 이미지 업로드·PNG 정규화 구현** ✅
    - PNG/JPEG/WebP 원본만 허용하고 애니메이션은 거절
    - 서버가 실제 바이트를 검증한 뒤 `480×480` PNG로 정규화
11. **Draft Service 구현** ✅

    OWNER/ACTIVE 검증, 후보 선택, 7일 만료, ORIGINAL/AI/DEFAULT/Slot 저장

    Memory Jar AWS Rekognition · S3 · EC2 IAM 역할 설정 정리

12. AI 결과 이미지 검증·PNG 정규화 구현 ✅
    - 일반 AI 후보의 포맷·최대 바이트·최소/최대 해상도 확정
    - 디코딩 실패·손상 이미지 거절
    - Pixel의 최종 결과는 `480×480` 고정, 일반 스타일에는 강제하지 않음
13. **Cloudflare Properties / Client 구현,** Cloudflare Client 보완 및 계약 테스트 ✅
    - 환경변수 기반 Account ID, Token, Model, Timeout
    - REST 요청·응답 파싱과 오류 매핑 구현
    - 실제 API 호출 없는 요청·응답 단위 테스트 완료
    - `1024×1024` 요청·응답 검증 포함
14. **PIXEL Java 후처리 구현** ✅
    - `64×64 → 24색 → 480×480`로 변경
    - `PIXEL_PP_V1` 고정
15. **AI Generation Service 구현** ✅
    - Draft lock → PROCESSING 중복 방지·생성·커밋
    - 트랜잭션 밖에서 S3 원본 로드 → Cloudflare → Pixel 후처리 → 최종 PNG 검증·Rekognition 심사 → 후보 S3 업로드
    - 재잠금 후 성공/실패 기록 및 늦은 응답 차단
16. **stale 처리·실패 복구·S3 Cleanup 구현** ✅
    - 10분 초과 PROCESSING → `GENERATION_TIMEOUT`
    - PROCESSING 중 Finalize·취소 차단, 종료 Draft는 10분 유예 뒤 정리
    - 후보는 Generation ID 기반 결정적 Key, 원본 삭제 완료는 V33 `original_s3_deleted_at`에 기록
    - Draft 종료·업로드 실패·늦은 응답의 임시 S3 객체 정리
17. **Finalize Service 구현** ✅
    - ORIGINAL / AI / DEFAULT 세 경로
    - DEFAULT는 기존 Jar 생성 로직 재사용, `JarDesign` 미생성
    - PROCESSING 중 최종화 거절, 커스텀 이미지는 영구 S3 복사 뒤 선택 Snapshot 재검증
18. **API / DTO / Controller 구현** ✅
    - Draft 생성·조회, AI 생성, 선택·Slot 저장, Finalize HTTP API 연결
    - 조회 응답은 비공개 S3 Key/URL 없이 상태·후보 메타데이터만 반환
    - Draft 기반 API
    - Jar 생성 뒤 `apply/revert` API는 만들지 않음
19. **백엔드 테스트 완성** ✅
    - 단계별 단위 테스트 + 서비스 간 통합 시나리오
    - 권한, 중복 생성, 타 Draft 후보, Cloudflare/S3 실패, stale, Pixel 실패, 중복 Finalize
20. **React Canvas 구현** ✅
    - `/jars/design/new`의 별도 화면에서 480×480 Canvas PNG를 만든다.
    - 기존 `/jars/new` 기본 Jar 생성 Form은 유지한다.
21. **Draft / AI API 계층 연결** ✅
    - Draft 생성·조회·Generation 요청·선택·Slot·Finalize API 모듈을 연결한다.
22. **AI 후보 보관함 구현** ✅
    - ORIGINAL과 성공한 AI 후보를 OWNER 전용 Presigned GET URL로만 미리보기한다.
    - Draft 조회 응답에는 Private S3 Key나 URL을 포함하지 않는다.
23. **Slot Editor 구현** ✅
    - ORIGINAL/AI 선택 이미지 위 Pointer 드래그·방향키·위치/크기 Slider·저장·복원
    - 너비 = 이미지 너비 × `(0.12 + 0.16 × ratio)`, 높이 = 너비 / 3.5
    - React의 경계 보정과 서버 저장·Finalize 경계 검증, 선택 후보 변경 충돌 처리
    - PNG에 합성하지 않고 공용 Overlay로 표시; 실서비스 S3를 통한 브라우저 검증은 별도
24. **최종 미리보기·Finalize UX 구현** ✅
    - ORIGINAL/AI는 Presigned 미리보기 이미지와 저장된 Slot Overlay를 최종 확인하고, DEFAULT는 기존 Theme Jar 경로를 안내한다.
    - JarCreateRequest의 이름·설명·Theme·인원·오픈·공개 설정을 입력한 뒤 Draft Finalize API를 한 번만 호출한다.
    - 미저장 Slot, PROCESSING, 이미지 미리보기 실패, 중복 Finalize를 화면에서도 구체적인 사유로 막고 서버 오류 코드를 다시 안내한다.
25. **기존 Jar 화면에 Optional `JarDesign` 연결**
    - `JarsPage`, `JarDetailPage`, `JarZoomModal`, `JarOpenCelebrationModal`
    - 디자인 없음은 기존 Theme Jar 유지
26. **배포 구성 검증**
    - Docker, GitHub Actions, Vercel, 운영 환경변수 연결
    - `APP_AI_CLOUDFLARE_*` 주입 경로 검증
27. **전체 통합 테스트 → 배포 → Smoke Test → 문서화**

오후 6:06

그래서 네가 적어둔 **두 번째 24단계가 뼈대는 맞고**, 위처럼 첫 번째 목록에서 아직 유효한 Cloudflare Client, 이미지 검증, S3 정책, React 표시 연결, 운영 Secret 등의 내용을 알맞은 단계 안으로 흡수시키면 돼.

# 왜 이전 계획보다 현재 구조가 더 안전한가 — 최종 v1

기존 프로젝트의 잘 동작하는 Jar 생성 기능은 최대한 유지하면서, 커스텀 디자인 기능만 **Jar 생성 전 별도의 Draft 흐름으로 추가**한다.

핵심 원칙은:

> **기존 기본 Jar 생성 기능은 그대로 유지하고, 직접 디자인을 선택한 사용자에게만 `Draft → AI 후보 → Slot → Finalize` 흐름을 추가한다.**
>

---

# ① `JarsNewPage`의 기존 Jar 생성 흐름을 깨지 않는다

현재 기존 Jar 생성 흐름은 이미:

```
POST /api/v1/jars
↓
createdJar.jarId
↓
navigate(`/jars/${createdJar.jarId}`)
```

형태로 정상 동작하고 있다.

이 **기본 Jar 생성 흐름 자체는 그대로 보존한다.**

다만 예전처럼:

```
기본 Jar 생성
↓
Jar 상세
↓
AI 꾸미기
```

로 가지는 않는다.

이 구조는 폐기한다.

---

## 최종 구조

사용자가 저금통 만들기를 시작하면 먼저 디자인 방법을 선택한다.

```
저금통 만들기
│
├─ 🫙 기본 저금통 사용
│      ↓
│   현재 기존 Jar 생성 흐름 그대로
│      ↓
│   POST /api/v1/jars
│      ↓
│   Jar 생성
│      ↓
│   상세 화면
│
└─ 🎨 직접 그려서 만들기
       ↓
     Canvas
       ↓
    [그림 완성]
       ↓
     Draft 생성
       ↓
   원본 / AI / 기본 선택
       ↓
   후보 선택 + Slot 설정
       ↓
     최종 미리보기
       ↓
       Jar 생성
```

즉:

```
기본 Jar
→ 기존 코드 최대한 그대로 ✅

커스텀 Jar
→ Jar 생성 전에 새로운 Draft 흐름 ✅
```

이다.

---

# `JarsNewPage`를 어떻게 할지는 구현 단계에서 결정

중요한 건 특정 React 파일에 모든 기능을 억지로 넣지 않는 것이다.

예를 들어:

```
/jars/new
↓
디자인 방법 선택
```

까지만 두고,

직접 그리기는 별도 화면이나 단계로 분리할 수 있다.

예:

```
/jars/new
→ 기본 Jar 생성

/jars/design/new
→ Canvas / Draft / AI
```

같은 방식도 가능하다.

정확한 Route 구조는 실제 최신 Frontend 코드를 다시 확인하고 정한다.

핵심은:

> **기존 Jar 생성 Form 안에 Canvas·Cloudflare·후보 보관함·Slot Editor를 전부 억지로 욱여넣지 않는다.**
>

---

# ② 기존 `theme`은 그대로 유지한다

이 부분은 지금 방향과 그대로 맞다.

AI/커스텀 디자인이 추가돼도 기존:

```
JarTheme
```

은 없애지 않는다.

둘의 역할은 다르다.

```
JarTheme
→ 페이지 배경
→ 카드 색감
→ 파티클
→ 장식
→ 버튼/UI 분위기
```

반면:

```
JarDesign
→ 실제 저금통에 표시되는 커스텀 이미지
```

를 담당한다.

예:

```
LAVENDER Theme
+
사용자가 만든 토끼 PIXEL 디자인
```

같이 공존할 수 있다.

---

## 중요한 점

Theme에 맞춰 AI 이미지를 강제로 다시 칠하지 않는다.

```
JarTheme 색상
↓
AI 이미지 색상 강제 변경 ❌
```

AI 이미지는 원본 색상과 선택 스타일을 최대한 유지한다.

즉:

```
Theme
≠
AI Style
```

이다.

---

# ③ 기존 Jar 표시 UI를 통째로 갈아엎지 않는다

이 방향도 맞다.

다만 지금은 **`JarVisual` 하나만 확인하면 안 된다는 것까지 추가로 확정**했다.

현재 Jar를 보여주는 위치들이 여러 군데 있기 때문에 모두 점검해야 한다.

예:

```
JarsPage
→ JarListVisual

JarDetailPage
→ JarVisual

JarZoomModal

JarOpenCelebrationModal
```

등.

실제 구현 전에 최신 코드 기준으로 다시 전체 검색한다.

---

# 표시 원칙

기존 Jar:

```
jar_designs 없음
↓
기존 Theme/CSS Jar 그대로 표시
```

커스텀 Jar:

```
jar_designs 있음
↓
final_s3_key 기반 이미지
+
Slot Overlay
```

로 분기한다.

개념적으로:

```
Jar 화면
│
├─ glow
├─ theme particle
├─ onboarding ref
├─ 기존 interaction
│
├─ JarDesign 없음
│    └─ 기존 CSS/Theme Jar
│
└─ JarDesign 있음
     ├─ Custom image
     └─ Slot Overlay
```

이다.

---

# 기존 기능은 반드시 유지

AI 디자인 때문에 기존:

```
파티클 애니메이션
쪽지 확인 기능
확대 모달
온보딩 Ref
Theme 배경
오픈 연출
```

등이 사라지면 안 된다.

즉 커스텀 이미지는 **기존 Jar 화면 전체를 대체하는 것이 아니라 Jar의 시각적 본체 부분만 분기**한다.

---

# ④ 무료 사용량 정책 — 기존 문서 수정 필요

기존 문서에서는:

```
현재 사용자
↓
최근 생성 횟수 확인
↓
허용 여부 판단
```

으로 Cloudflare 호출 전 사용자별 횟수를 제한하려고 했다.

현재 v1에서는 이 정책을 사용하지 않는다.

---

## 현재 정책

사용자에게:

```
하루 N회
Draft당 N회
스타일당 N회
```

같은 고정 생성 횟수 제한을 두지 않는다.

따라서 현재 Backend에서:

```
최근 생성 횟수 COUNT
↓
Quota 초과 여부 검사
```

를 매번 할 필요도 없다.

---

## 대신 반드시 막는 것

**동시 생성이다.**

한 Draft에서:

```
PROCESSING Generation = 1개
```

만 존재할 수 있도록 한다.

```
AI 생성 요청
↓
Draft Lock
↓
Draft ACTIVE 확인
↓
현재 PROCESSING Generation 존재?
│
├─ YES → 새 요청 거절
│
└─ NO → 새 Generation 생성
```

Frontend에서도 생성 중에는 버튼을 비활성화한다.

하지만:

```
Frontend 버튼 잠금
→ UX 보조

Backend 검증
→ 실제 안전장치
```

이다.

---

# Cloudflare 사용량은 모니터링

PoC에서 확인했던 Neuron 사용량은 **참고 자료**로 남겨도 된다.

하지만:

```
하루 60회 제한
```

같은 값을 v1 제품 정책으로 고정하지 않는다.

운영 이후 실제 사용량을 보고 필요하면:

```
사용자별 Limit
서비스 전체 Limit
Rate Limit
```

을 환경설정 기반으로 추가한다.

즉:

```
v1
→ 생성 횟수 제한 없음
→ 동시 생성만 방지

향후
→ 사용량을 보고 Quota 정책 추가
```

이다.

---

# ⑤ AI 서버 구조 최종안

예전 구조에서 가장 큰 변화는:

```
Jar 대표 이미지
```

에 바로 적용하는 단계가 없어졌다는 것이다.

최종 구조는 아래와 같다.

```
┌─────────────────────────────┐
│ React                       │
│                             │
│ 480×480 Canvas              │
│        ↓                    │
│ PNG Blob                    │
└──────────────┬──────────────┘
               │
               ↓
┌─────────────────────────────┐
│ Spring Boot                 │
│                             │
│ 로그인 사용자 확인          │
│ Draft OWNER 권한 확인       │
│ 이미지 검증                 │
│ Draft 관리                  │
│ Generation 관리             │
│ 동시 생성 제어              │
│ Prompt / Reference 선택     │
│ Finalize 처리               │
└───────┬──────────┬──────────┘
        │          │
        │          │
        ↓          ↓
┌──────────────┐  ┌──────────────────────┐
│ Private S3   │  │ Cloudflare Workers AI│
│              │  │                      │
│ 원본 Canvas  │→ │ FLUX.2 Klein 4B     │
└──────────────┘  └───────────┬──────────┘
                              │
                              ↓
                       Cloudflare Raw
                              │
                     PIXEL이면 Java 후처리
                              │
                              ↓
                         Spring Boot
                              │
                              ↓
                    ┌────────────────┐
                    │ Private S3     │
                    │ AI 후보 이미지 │
                    └───────┬────────┘
                            │
                            ↓
                 jar_ai_generations
                            │
                            ↓
                      React 후보 보관함
                            │
                  ┌─────────┴─────────┐
                  │                   │
                원본                AI 후보
                  │                   │
                  └─────────┬─────────┘
                            ↓
                       최종 선택
                            ↓
                     Slot 위치/크기
                            ↓
                       최종 Preview
                            ↓
                       Jar Finalize
                            │
                  ┌─────────┴─────────┐
                  ↓                   ↓
               jars             jar_designs
                                    │
                              ORIGINAL / AI
```

---

# ⑥ Pixel만 추가 처리 존재

일반 AI 스타일:

```
원본
↓
Cloudflare
↓
결과 검증
↓
S3
↓
Generation SUCCEEDED
```

PIXEL:

```
원본
↓
Cloudflare
↓
Raw 이미지
↓
Java PixelPostProcessor
↓
64×64 bilinear 축소
↓
최대 24색 median-cut 팔레트
↓
Nearest Neighbor
↓
480×480
↓
S3
↓
Generation SUCCEEDED
```

이다.

운영에:

```
Python ❌
Pillow ❌
FastAPI ❌
```

를 넣지 않는다.

---

# ⑦ DB 기록 위치도 명확하게 분리

원본 작업 상태:

```
jar_design_drafts
```

AI 생성 시도:

```
jar_ai_generations
```

완성된 Custom Jar:

```
jar_designs
```

실제 Jar 자체:

```
jars
```

---

# AI 후보 생성 시 아직 `jars`는 없다

중요하다.

```
Draft
↓
Generation
↓
후보 비교
```

단계에서는 아직:

```
jar_id
```

가 없다.

따라서 AI Generation은:

```
jar_id ❌
draft_id ✅
```

로 연결한다.

---

# ⑧ `[이 디자인 사용]`의 의미도 수정

예전에는:

```
AI 결과
↓
[이 디자인 사용]
↓
기존 Jar 대표 이미지 변경
```

이라는 의미였다.

현재는 아니다.

현재 `[이 디자인 사용]` 또는 `[선택]`은:

```
이 후보를 현재 Draft의 최종 후보로 선택
```

이라는 의미다.

예:

```
Draft.selected_design_type = AI
Draft.selected_generation_id = 503
```

정도.

아직 Jar는 만들어지지 않는다.

---

# 최종 적용은 `[저금통 만들기]`

후보 선택 후:

```
Slot Editor
↓
Final Preview
↓
[저금통 만들기]
```

를 눌렀을 때 비로소:

```
jars 생성
+
필요하면 jar_designs 생성
+
Draft FINALIZED
```

가 된다.

---

# ⑨ 기본 Jar는 새 구조를 거치지 않는다

처음부터 기본 Jar:

```
기존 Jar 코드
↓
jars 생성
```

끝.

```
Draft ❌
Generation ❌
JarDesign ❌
```

이다.

---

# ⑩ 직접 그리다가 기본 Jar를 선택하는 경우

이 경우만 Draft가 존재하는 기본 Jar다.

```
직접 그리기
↓
Draft
↓
AI도 사용했을 수 있음
↓
기본 저금통 선택
↓
기존 Jar 생성 핵심 로직 재사용
↓
Jar 생성
```

그리고:

```
jar_designs 생성 ❌
```

Draft는:

```
selected_design_type = DEFAULT
selected_generation_id = NULL

slot_center_x = NULL
slot_center_y = NULL
slot_size_ratio = NULL

status = FINALIZED
finalized_jar_id = 생성 Jar ID
```

로 마무리한다.

---

# ⑪ AI 서버 구조에 없는 것

이 부분은 기존 문서와 동일하다.

```
❌ Python 운영 Runtime
❌ FastAPI
❌ GPU EC2
❌ 별도 AI 서버
❌ Cloudflare Worker 애플리케이션 직접 배포
```

Spring Boot가:

```
Cloudflare Workers AI REST API
```

를 직접 호출한다.

---

# ⑫ 긴 DB Transaction도 사용하지 않는다

Cloudflare와 S3 작업을 기다리는 동안 DB Connection을 잡고 있지 않는다.

AI 생성:

```
짧은 DB Tx
↓
PROCESSING Generation 생성
↓
Tx 종료

Cloudflare 호출
↓
필요하면 Pixel 후처리
↓
S3 저장

짧은 DB Tx
↓
SUCCEEDED / FAILED 반영
↓
Tx 종료
```

로 처리한다.

---

# ⑬ 최종 S3 구조

임시 작업:

```
jar-design-drafts/
└─ {ownerId}/
   └─ {draftUuid}/
      ├─ original.png
      └─ ai/
         ├─ 501.png
         └─ 502.png
```

최종 Custom Jar:

```
jar-designs/
└─ {ownerId}/
   └─ {uuid}/
      └─ final.png
```

DB에는 URL이 아니라:

```
S3 Object Key
```

만 저장한다.

---

# ⑭ 최종 생성 이후 디자인 변경 불가

예전 구조처럼 Jar 상세 화면에서:

```
AI 다시 생성
Apply
기본으로 복구
```

기능을 제공하지 않는다.

Jar 생성 이후:

```
AI 추가 생성 ❌
다른 후보 적용 ❌
원본으로 변경 ❌
기본 Jar로 변경 ❌
Slot 이동 ❌
Slot 크기 변경 ❌
```

이다.

---

# ⑮ 앞으로 진행 번호 규칙

**“메인 번호를 함부로 바꾸지 않는다”는 원칙 자체는 좋아.**

다만 기존 문서의:

```
25단계
```

는 예전 구조를 기준으로 만든 것이기 때문에 이제 그대로 고정하면 안 된다.

현재 최종 설계를 반영해 새 Master 순서를 이미 정했으므로 **앞으로는 그 순서를 기준으로 고정**한다.

현재 큰 진행 상태는:

```
1. 정책 / Prompt 확정                   ✅
2. UX / 권한 정책 확정                 ✅
3. 최종 ERD / DB 구조 확정             ✅
   ├ jar_design_drafts                  ✅
   ├ jar_ai_generations                 ✅
   ├ jar_designs                        ✅
   └ 기존 jars 변경 여부                ✅ 변경 없음

4. 전체 FK / CHECK / INDEX 최종 SQL     ← 다음
5. Flyway
6. Enum
7. Entity
8. Repository
9. 원본 업로드 / 검증
10. Draft Service
11. Cloudflare Properties / Client
12. AI Generation Service
13. PIXEL Java 후처리
14. stale / S3 cleanup
15. Finalize Service
16. API / DTO / Controller
17. Backend Test
18. React Canvas
19. Frontend API 연결
20. 후보 보관함
21. Slot Editor
22. Final Preview / Finalize UI
23. 기존 Jar 표시 지점 연결
24. 통합 테스트 / 배포 / Smoke Test / 문서화
```

이 **24단계 기준을 앞으로 고정**하면 돼.

---

# 세부 작업이 추가되는 경우

예를 들어 12번 AI Generation Service 구현 중 추가 작업이 발견되면:

```
12. AI Generation Service

12-1. Generation 시작 Transaction
12-2. Cloudflare 호출
12-3. SUCCEEDED 처리
12-4. FAILED 처리
12-5. 동시 생성 검증
```

처럼 넣는다.

갑자기:

```
12 다음에 26번 추가
```

처럼 전체 순서를 흔들지 않는다.

---

# 완료 보고 형식

이 형식도 그대로 유지하면 좋아.

예:

> ✅ **4번 전체 FK / CHECK / INDEX 최종 SQL 검토 완료**
>
>
> 다음은 **5번 Flyway Migration 작성**이야.
>

그리고 세부 단계라면:

> ✅ **12-2 Cloudflare 호출 구현 완료**
>
>
> 다음은 **12-3 SUCCEEDED 처리**야.
>

이렇게 현재 위치를 항상 명확하게 알려주는 방식으로 간다.

---

# 기존 문서에서 지워야 하는 문장만 다시 정리

다음은 지금 남겨두면 헷갈리니까 삭제해야 해.

```
기본 Jar 생성
→ jarId 확정
→ 상세 화면
→ AI 꾸미기
```

❌

대신:

```
직접 디자인
→ Draft
→ AI 후보
→ Slot
→ 마지막에 Jar 생성
```

---

```
사용자 최근 생성 횟수 검사
→ 허용 여부 판단
```

❌ v1에서는 제거.

대신:

```
Draft당 동시 PROCESSING 1건
```

---

```
[이 디자인 사용]
→ Jar 대표 이미지
```

❌

대신:

```
[이 디자인 선택]
→ Draft의 현재 후보 선택
→ Slot
→ 최종 Jar 생성
```

---

```
JarVisual 하나만 변경
```

❌

대신:

```
Jar가 표시되는 모든 위치 확인
+
Optional JarDesign 분기
```

---

```
25단계 고정
```

❌ 예전 계획.

대신:

```
현재 최종 24단계 고정
+
필요 시 N-1 / N-2 추가
```

---

## 최종적으로 이 문서의 핵심 문장은 이렇게 바꾸면 돼

> **기존 기본 Jar 생성 기능은 현재 코드 그대로 최대한 유지한다. AI/커스텀 디자인은 이미 만들어진 Jar를 꾸미는 기능이 아니라, Jar를 생성하기 전에 Draft에서 원본과 여러 AI 후보를 비교하고 Slot까지 확정한 뒤 최종 Jar를 만드는 별도의 사전 디자인 흐름이다.**
>
