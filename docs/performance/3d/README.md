# 저금통 3D 전환 성능 비교

처음부터의 작업 흐름과 현재 결론은 [쉽게 읽는 작업 정리](JOURNEY_2026-10-25.md)를 먼저 본다.
이 README는 측정 환경·방법·상세 수치의 기록이고, JSON 파일은 실제 숫자 원본이다. 같은 설명을 양쪽에 반복하지 않는다.

## 최적화 전 기준점 · 2026-10-25 (한국 시간)

- 대상: `C:\Users\whdgu\Desktop\graduation`, `main`, 기존 HEAD `ec65aca` 위의 개발 전용 계측 변경.
- 변경 범위: 3D 구간별 계측, 합성 진단 화면, 제공된 사진형 저금통의 표시 윤곽 53점, 검증 코드 및 이 폴더의 비교 자료.
- 제외: 운영 배포, DB/API 변경, 개인 사진·인증정보, 의존성 설치 파일, 빌드 산출물 및 관련 없는 미추적 파일.
- 개발 서버: `cd frontend` 후 `npm run dev -- --host 127.0.0.1 --port 4177 --strictPort`.
- 진단 주소: `http://127.0.0.1:4177/tests/jar-3d-timing.html`.
- 원시 기록: `before-optimization-2026-10-25.json`, 화면: `before-optimization-2026-10-25.jpg`.
- 반복 비교: 같은 브라우저·도안·480px 합성 PNG를 사용하고, 7개 조건 각각 6회 실행한다. 첫 실행을 제외한 5회의 중앙값을 비교한다. 다운로드 캐시는 지우지 않았다.
- 기록마다 그리기 영역과 배율을 포함한다. 창 크기·기기·운영/개발 빌드가 달라진 결과를 직접 비교하지 않는다.
- `renderer.render` 반환을 완료 기준으로 삼는다. GPU 완료·실제 모니터 출력 시점은 아니다.
- 이미지 onload 구간에는 로딩·해석·메인 스레드 대기가 포함된다. 중첩 구간이나 구간별 중앙값을 임의로 합산하지 않는다.
- 운영 사진형 전환 관찰값은 자동화 지연을 포함하므로 로컬 계측값과 빼서 서버 시간을 추정하지 않는다.

## 모양 보존 검증

`frontend/tests/fixtures/body3DGeometryBefore.json`은 최적화 전에 생성한 모양의 좌표·법선·UV·삼각형·재질 그룹 해시다.
기본 틀, 불규칙 윤곽, 깊은 굴곡, 뾰족한 바닥, 가는 팔다리와 역방향을 포함한다.
최적화 후 이 기준 파일을 새 값으로 덮어써서 테스트를 통과시키지 않는다.

## 검증 상태

기준점 계측 버전에서 프론트엔드 Node 테스트 227개, 운영 빌드, 3D 오류 복구·중복 집계 방지, PC/모바일 가로 넘침 검사를 통과했다.
모양 보존 기준 15개를 추가한 뒤 최적화 전 전체 Node 테스트 242개도 통과했다.
운영 빌드에서는 진단 결과 출력이 제거되고 진단 HTML은 빌드 산출물에 포함되지 않는다.
운영 이미지의 실제 응답 시간과 GPU 완료 시간은 이 기준점에서 측정하지 않았다.

## 로컬 최적화 재확인 · 2026-10-25

- 변경: `body3DMesh.mjs`의 사진 면에서 정점 번호별 높이와 앞/뒤 정점 번호를 한 번만 계산한다. 계산 결과는 해당 면을 만드는 동안만 재사용한다. 사진·윤곽·분할 품질·입구 투영 방법은 변경하지 않았다.
- 현재 코드에서 Node 테스트 242개 및 운영용 로컬 빌드가 통과했다. 15개 기준 모양의 좌표·법선·UV·인덱스·재질 그룹 해시가 동일하다. 기존 500kB 초과 번들 경고는 남아 있다. 배포·푸시는 하지 않았다.
- 사진형 윤곽 + 480px 합성 PNG를 같은 페이지에서 6회 실행한 원시 기록은 `after-optimization-photo-outline-2026-10-25.json`, 화면은 `after-optimization-2026-10-25.jpg`다. 그리기 영역 420×420, 배율 1.25, 삼각형 28,160개다.
- 첫 실행 제외 5회 중앙값: 클릭→모든 텍스처 render 반환 494.40ms, 몸통 계산 432.50ms, 사진 곡면 정점 생성 44.00ms, 합성 사진 onload 대기 21.10ms. 실제 사진 다운로드나 GPU 완료 시간은 아니다. 이 재확인은 7개 조건 전체의 재측정을 대신하지 않는다.
- `frontend/tests/body-3d-benchmark.mjs`는 기준 커밋 `504f3b6`을 메모리로 불러와 현재 구현과 같은 프로세스에서 비교한다. 각 구현 3회 예열 후 순서를 번갈아 7쌍 실행하며 모든 쌍의 모양 해시가 동일하다. 원시 값은 `cpu-comparison-2026-10-25.json`에 보관한다.
- 해당 CPU 단독 실행 중앙값: ROUND 977.82→1184.38ms(21.12% 증가), IRREGULAR 2023.46→997.63ms(50.70% 감소), DEEP 571.36→473.95ms(17.05% 감소). 사진 정점 구간은 모두 줄었지만 전체 계산은 ROUND에서 느려졌다. 실행 중 부하·메모리 정리·예열 영향이 분리되지 않았으므로 모든 조건 개선이나 최종 개선율을 확정하지 않는다. 브라우저 전체 전환과도 혼합하지 않는다.

## 사용자가 제공한 실제 이미지 요청 관찰값

- 앞서 제공된 운영 IMAGE 요청 1회: 총 526.08ms, 응답 시작 대기 523.27ms, 다운로드 0.50ms.
- 이후 로컬 화면이라고 제공한 사진형 요청 1회: 총 약 1.11초, 응답 시작 대기 약 1.10초, 다운로드 10.07ms.
- 같은 추가 캡처의 동물 도안 IMAGE 요청 1회: 총 583.09ms, 응답 시작 대기 574.70ms, 다운로드 6.37ms.
- 최초 Timing 캡처만으로 요청 서버를 확정하지 않았다. 후속 Headers 캡처에서 동물 도안의 요청이 `http://localhost:8080/api/v1/jars/{jarId}/design/texture?part=IMAGE` 형태의 로컬 API임을 확인했다. 불필요한 실제 저금통 번호는 기록하지 않는다. 서로 다른 사진과 단일 표본을 최적화 전후 비교로 해석하지 않는다.
- 응답 시작 대기는 서버 내부 처리뿐 아니라 네트워크 지연 등을 포함한다. DB/S3/서버 계산 원인은 이 캡처만으로 분리할 수 없다. 인증 쿠키가 노출된 기존 Headers 캡처는 이 저장소에 복사하지 않는다.

## 로컬 백엔드 이미지 계측

- 기본 꺼짐이다. `local` 활성 프로필과 프로그램 인수 `--app.monitoring.texture-diagnostics-enabled=true`를 모두 적용하고 백엔드를 재시작해야 한다. `prod`가 함께 켜져 있으면 명시적 활성화 인수가 있어도 기록하지 않는다. 기존 비밀 환경변수는 변경하지 않는다.
- IntelliJ: 실행 이름 옆 메뉴 → Edit Configurations → 현재 백엔드 → Modify options → Program arguments에서 위 인수를 추가한다. VM options가 아니다. 기존 프로필 인수가 이미 `local`이면 중복 추가하지 않는다.
- 기존 loopback 관리 주소 `http://127.0.0.1:9091/actuator/resources`의 `loginDiagnostics.textures`에서만 읽는다. 관리 포트·외부 공개·인증/CORS·캐시 정책·PNG 응답은 바꾸지 않았다. 시간 수집용 공개 API나 비밀 토큰을 추가하지 않았다.
- 활성화 확인: `textures.enabled=true`. `recent`는 최대 64개, `completedCount`와 `evictedCount`로 누락을 구분한다. `completed`는 필터 체인이 정상 반환했다는 뜻으로 HTTP 성공과 다르며, 정상 통계에는 `completed=true`와 `responseStatus=200`을 모두 확인한다.
- 고정 분류 `TEXTURE_IMAGE`와 `TEXTURE_BODY`만 보존한다. Jar/User ID, URL, 사진 바이트, S3 키, 쿠키, JWT, 예외 메시지는 보존하지 않는다. 번호가 없으므로 반복 측정 중에는 같은 저금통만 사용하고 다른 창의 이미지 요청을 섞지 않는다.
- 구간: `elapsedNanos`는 보안 필터 전부터 응답 쓰기 후 필터 반환까지 서버에서 관찰한 요청 시간이다. 브라우저 요청 전체·네트워크 전송 완료·GPU 시간은 아니다. `TEXTURE_DB`는 트랜잭션 시작/연결 획득/두 조회/완료를 포함하고, `TEXTURE_MEMBER_LOOKUP`과 `TEXTURE_DESIGN_LOOKUP`은 그 하위 구간이므로 중복 합산하지 않는다.
- `TEXTURE_S3_OPEN`은 AWS 인증정보 준비·연결·재시도·응답 헤더 수신 등을 포함한다. 순수 S3 내부 처리 시간이나 정확한 첫 바이트 시각이 아니다. `TEXTURE_S3_READ`는 반환 스트림에서 전체 이미지 읽기를 마칠 때까지다. 이미지 검증·스트림 닫기·프레임워크 처리 등은 상위 전체 시간에 포함된다.
- 재시작 뒤 동일한 상세 화면에서 2D→3D를 6회 수행한다. 첫 관찰 요청과 이후 5회의 중앙값·범위를 분리하고 IMAGE와 BODY를 섞지 않는다. 첫 요청은 JVM/연결 등의 예열을 포함할 수 있으며 S3 캐시까지 비워진 콜드 상태라는 뜻은 아니다. 재시작 후 다른 요청을 먼저 했다면 서버 최초 요청이라고 부르지 않는다.
- 신규 계측/기존 로그인·조회 진단/이미지 읽기 관련 테스트 33개 통과. 실제 DB/S3 요청의 구간별 반복 측정은 로컬 백엔드 재시작과 로그인된 화면 준비 후 수행해야 한다. 이 단위 테스트 결과를 실제 서버 성능값으로 사용하지 않는다.
- 분석이 끝나면 프로그램 인수를 제거하고 다시 시작해 계측을 해제한다. 배포·푸시는 하지 않는다.

### 실제 로컬 요청 6회 결과 · 2026-10-25 16:19 KST

- `backend-texture-before-optimization-2026-10-25.json`에 개인정보 없는 원시 기록과 집계를 보관했다. 재시작 직후 사전 확인은 기록 0건이었고 측정 후 정확히 6건, 누락 0건이다. 모두 `TEXTURE_IMAGE`, `completed=true`, HTTP 200이며 BODY 요청은 없다. 같은 저금통 사용 여부는 사용자 실행 절차에 의존한다.
- 서버 요청 전체: 첫 관찰 1412.57ms, 이후 5회 중앙값 270.12ms, 범위 179.31~709.08ms.
- DB 트랜잭션 전체: 첫 관찰 27.21ms, 반복 중앙값 21.28ms, 범위 20.39~30.20ms. 별도 JDBC 계측은 켜지 않았으므로 연결 획득/개별 SQL 실행 비용이 완전히 분리된 결과는 아니다.
- S3 OPEN: 첫 관찰 1146.72ms, 반복 중앙값 70.31ms, 범위 62.29~90.31ms.
- S3 스트림 전체 읽기: 첫 관찰 216.92ms, 반복 중앙값 154.51ms, 범위 61.95~605.43ms.
- 요청별 S3 OPEN+READ 합계: 첫 관찰 1363.65ms, 반복 중앙값 228.39ms, 범위 132.26~667.72ms. 각 구간 중앙값을 더한 값이 아니다.
- 6건 모두 관찰된 JVM GC 증가량은 0이다. 이번 표본에서는 이미지 처리 DB보다 S3 경로가 주된 대기 구간이다. 최초 OPEN 비용의 원인이 DNS/TLS/인증정보/재시도 중 무엇인지는 아직 분리하지 않았다. 이를 S3 서버 자체가 느리다고 단정하지 않는다.
- 이번 수집에서는 계측 결과 문서만 추가했다. 이미지 캐시, 권한 정책, S3 클라이언트 설정, API 응답은 변경하지 않았다. 개선 후보는 권한/현재 디자인을 매 요청 확인한 뒤 같은 최종 이미지의 S3 반복 읽기만 줄이는 제한된 메모리 재사용이다. 이는 비공개 이미지 보관 방식과 메모리 상한·만료 정책을 정해야 하는 별도 구현 단계다. 최초 조회 지연을 해결하는 것과도 구분해야 한다.

### 제한된 이미지 캐시 구현 · 로컬 재측정 전

- 사용자 승인 후 `JarDesignTextureCache`를 추가하고 `JarDesignTextureService`가 매 요청 DB 권한/디자인을 확인한 다음에만 호출하도록 연결했다. 기존 PNG 응답·16MiB 입력 제한·no-store·인증/인가·DB 트랜잭션 경계는 유지한다. S3 클라이언트/DB 스키마/프론트 API는 바꾸지 않았다.
- 캐시 키는 서버 DB가 가리키는 버킷+객체 키다. 저장 후 60초 고정 만료이며 이미지당 4MiB, 저장 이미지 바이트 합계 16MiB, 항목 64개로 제한한다. 공간이 모자라면 최근에 쓰지 않은 항목부터 제거한다. 4MiB 초과 이미지도 기존 제한 안에서는 반환하지만 저장하지 않는다.
- 같은 객체의 진행 중 S3 읽기를 공유한다. 대기 맵은 최대 8개 객체이며 초과한 새 객체는 원래 직접 읽기로 우회한다. 네트워크/대기/응답 배열 복사는 맵 잠금 밖에서 실행한다. 실패한 읽기는 저장하지 않고 후속 요청이 재시도한다.
- 반환 배열은 복사본이다. 저장 바이트 16MiB는 JVM 전체 메모리 상한이 아니다. 진행 중 읽기·대기 결과·응답 복사본과 맵 메타데이터는 추가 메모리를 사용한다. 만료된 참조는 조회 시 또는 15초 주기 기존 스케줄러 작업에서 제거하고 실제 회수 시점은 JVM에 달려 있다.
- 로컬 계측에 `TEXTURE_CACHE_HIT/MISS/WAIT/BYPASS` 구간을 추가했다. MISS/BYPASS에는 하위 S3 시간이 포함되므로 중복 합산하지 않는다. HIT이면 S3 구간이 없는 것이 정상이다. WAIT는 다른 요청의 다운로드를 기다린 시간이므로 S3 비용이 사라진 것으로 해석하지 않는다.
- 최종 관련 테스트 66개(9개 클래스), 실패/오류/건너뜀 0개. 캐시 만료·LRU·바이트/개수 상한·동시 병합·상한 우회·실패 후 재시도·중단/시간 초과·서로 다른 키 분리·배열 변경 격리·비멤버/탈퇴/디자인 삭제·PNG/no-store·JWT 취소를 포함한다. 외부 DB/AWS 통신 없는 검증이며 전체 백엔드 테스트 전체를 실행한 것은 아니다. `bootJar` 로컬 빌드도 통과했다.
- 최종 검증 명령: `gradlew.bat --offline --no-daemon --console=plain test --tests shop.esjh.memoryjar.service.jar.JarDesignTextureCacheTest --tests shop.esjh.memoryjar.service.jar.JarDesignTextureServiceTest --tests shop.esjh.memoryjar.controller.jar.JarDesignTextureControllerTest --tests shop.esjh.memoryjar.monitoring.TextureDiagnosticsTest --tests shop.esjh.memoryjar.monitoring.LoginDiagnosticsTest --tests shop.esjh.memoryjar.monitoring.ReadDiagnosticsTest --tests shop.esjh.memoryjar.monitoring.ResourceUsageEndpointTest --tests shop.esjh.memoryjar.jwt.JwtAuthenticationFilterTest --tests shop.esjh.memoryjar.security.SecurityErrorHandlerTest bootJar`.
- 실측 전 확인에서 실행 중 서버는 기존 6건이며 캐시 구간 기록이 없었다. 캐시 적용 전후 실제 비교는 백엔드 재시작 후 같은 이미지 6회 요청을 받아 확인해야 한다. 첫 S3 읽기 지연이나 3D 모양 계산까지 해결했다고 주장하지 않는다. 캐시 상세 계약과 비활성화 방법은 `docs/ai/AI_3D_TEXTURE_ACCESS.md`에 기록했다.
- 배포·커밋·푸시는 하지 않았다. 재측정 시 기존 `--spring.profiles.active=local --app.monitoring.texture-diagnostics-enabled=true` 인수를 유지한다. 첫 전환부터 마지막까지 60초 안에 6회 수행해 첫 MISS와 이후 HIT 여부를 비교한다.

### 캐시 적용 후 실제 로컬 재측정 · 2026-10-25 16:42 KST

- 사용자 보고는 재시작 후 6회 전환이지만, 실제 진단은 7건(첫 MISS 1건 + 이후 HIT 6건)이다. 누락/축출 0건, 모두 TEXTURE_IMAGE·HTTP 200·completed=true다. 초과 1건의 원인은 이 식별자 없는 계측만으로 단정하지 않았다. 유리한 표본만 고르지 않고 7건 전체를 `backend-texture-after-optimization-2026-10-25.json`에 보관했다.
- 반복 서버 요청 전체: 적용 전 5건 중앙값 270.12ms → 적용 후 HIT 6건 중앙값 41.45ms, 약 84.65% 감소. 반복 범위는 전 179.31~709.08ms → 후 39.48~48.90ms다. 전후 표본 수가 달라, 후의 첫 HIT 5건만 맞춘 보조 비교도 보관했다(중앙값 40.92ms, 약 84.85% 감소).
- 후속 6건 모두 TEXTURE_CACHE_HIT가 있고 S3 OPEN/READ 구간은 없다. S3 읽기는 첫 1회만 실행됐으며 반복 6회에는 추가 다운로드가 없다. 캐시 배열 복사 구간 중앙값은 0.1745ms다.
- 매 요청에 TEXTURE_DB/MEMBER_LOOKUP/DESIGN_LOOKUP와 JWT/SESSION_VERSION_QUERY 구간이 남아 있다. 캐시 HIT의 DB 전체 중앙값은 23.75ms(전 21.28ms)로, DB 조회를 생략해 얻은 결과가 아니다. 실제 사용자 탈퇴/디자인 변경은 실행하지 않고 해당 동작은 기존 Mock 테스트로 검증했다.
- 최초 이미지 요청은 전 1412.57ms → 후 1598.56ms다. 후의 S3 OPEN 1410.15ms, 전체 읽기 62.57ms가 포함된다. 최초 지연이 해결된 것이 아니며 두 단일 요청의 차이를 캐시 자체의 성능 회귀나 S3 내부 원인으로 단정하지 않는다.
- 이번 수집은 이전에 검증한 캐시 코드 그대로 수행했고 소스는 수정하지 않았다. 앞서 관련 테스트 66개와 bootJar 빌드가 통과했으며 이번에는 재실행하지 않았다. 원시 결과에 현재 관련 소스 SHA-256을 함께 남겼다.
- 이는 서버 이미지 API의 반복 요청 비교다. 실제 2D→3D 전체 전환이 84.65% 빨라졌다는 의미가 아니며, 운영 배포/이미지 종류별 반복 시험/BODY 실측/GPU 완료 시간/앞선 프론트 전체 계산 편차는 별도 확인 대상이다. 배포·커밋·푸시는 하지 않았다.

### S3 첫 요청 세분화 계측과 3회 비교 · 2026-10-25 17:09~17:10 KST

- `TextureS3Diagnostics`는 기존 로컬 전용 계측이 켜진 이미지 요청의 실제 GetObject에만 SDK 숫자 지표 관찰자를 연결한다. 인증 제공자·S3 클라이언트·시간 제한·재시도·캐시·권한 검사를 변경하지 않는다. 허용한 시간/정수만 현재 요청에 보관하고 URL·객체 키·자격 증명·요청 ID·예외 원문은 읽어 저장하지 않는다. CloudWatch나 별도 외부 전송은 없다.
- `LoginDiagnostics`에 요청 구성 구간과 `s3Sdk`를 추가했다. 미제공 지표는 0으로 채우지 않고 생략한다. 종료 후/다른 스레드/다른 요청의 콜백은 버리고, 수집량을 제한하며 계측 실패는 원래 다운로드 결과를 바꾸지 않는다. 캐시 HIT에 SDK 지표가 없는 것은 정상이다.
- 사용자 실행 후 정확히 IMAGE 3건, HTTP 200·completed=true, 축출 0건, SDK 잘림 없음으로 확인했다. 순서는 MISS → HIT → MISS다. 3번째 요청은 첫 응답 완료 후 약 75.01초, 2번째 완료 후 약 71.89초에 시작했다. 원시 기록·집계·현재 관련 소스 해시는 `backend-texture-sdk-breakdown-2026-10-25.json`에 보관한다. 저금통 식별자는 수집하지 않아 동일 저금통 여부는 사용자 실행 절차에 의존한다.

| 측정 구간 (ms) | 첫 MISS | 바로 HIT | 만료 후 MISS |
| --- | ---: | ---: | ---: |
| 서버 요청 전체 | 1408.15 | 55.82 | 388.02 |
| DB 트랜잭션 전체 | 25.10 | 33.68 | 26.68 |
| S3 OPEN | 1256.66 | 미실행 | 243.80 |
| SDK 인증정보 준비 | 0.0587 | 미실행 | 0.0514 |
| SDK 연결 획득 | 57.12 | 미실행 | 1.72 |
| SDK 연결·전송·응답 헤더 수신 | 922.29 | 미실행 | 238.35 |
| SDK 서명 | 27.31 | 미실행 | 1.04 |
| SDK 응답 해석 | 47.27 | 미실행 | 0.74 |
| S3 스트림 전체 읽기 | 89.45 | 미실행 | 94.89 |

- 2개 실제 S3 요청의 재시도는 모두 0회, 관찰한 GC 증가도 0이다. 첫 요청의 인증정보 준비는 매우 짧아 이번 요청의 주 병목이 아니다. 가장 큰 관찰 구간은 연결·전송·응답 헤더 수신이다. 이는 네트워크와 클라이언트 연결 비용을 포함하므로 S3 서버 내부 처리만으로 단정하지 않는다.
- 위 행들은 중첩된다. 연결 획득은 연결·전송·응답 헤더 수신의 하위 구간이며, 이를 다시 더하지 않는다. 연결 획득 지표만으로 DNS/TCP/TLS/풀 대기를 각각 분리하지 않는다. ENDPOINT_RESOLVE는 SDK의 대상 주소 결정이며 DNS 자체 시간이 아니다.
- OPEN에서 SDK API_CALL을 뺀 관찰 범위 차이는 첫 요청 159.74ms, 만료 후 1.53ms다. 여기에는 요청 구성(16.84ms/0.07ms), 클래스 로딩·스케줄링·관찰자 비용 등 분리하지 못한 구간이 있어 순수 초기화 시간으로 명명하지 않는다. S3Client 빈 생성은 앱 시작 시점이므로 이번 요청 계측에 포함되지 않는다.
- 스트리밍 SDK TIME_TO_LAST_BYTE는 반환 변환기가 끝나는 시점까지여서 반환 뒤의 전체 이미지 읽기를 보장하지 않는다. 전체 바이트 읽기는 별도의 TEXTURE_S3_READ로 확인한다. 지표 정의는 [AWS SDK 공식 문서](https://docs.aws.amazon.com/sdk-for-java/latest/developer-guide/metrics-list.html)를 따른다.
- 각 조건 1회이며 65초 동안 HTTP 연결 상태도 달라질 수 있다. 최종 개선율이나 순수 초기화 원인은 확정하지 않는다. 캐시와 권한 검사는 유지하며 다음 확인은 같은 조건의 재시작 비교를 반복해 첫 연결·응답 대기의 재현성을 확인하는 것이다. 사전 다운로드·시작 시 예열·연결 정책 변경은 이번에 구현하지 않았다.
- 세분화 계측 구현 후 관련 테스트 73개/10클래스, 실패·오류·건너뜀 0개 및 bootJar 성공. 실제 SDK와 가짜 HTTP 응답을 조합한 테스트도 포함하며 외부 AWS를 호출하지 않는다. 이번 수집에서는 테스트 XML을 다시 확인했고 소스 변경·테스트 재실행·배포·커밋·푸시는 하지 않았다.

### 추가 재현성 관찰과 연결 획득 지표 해석 정정 · 2026-10-25 17:18~17:19 KST

- 사용자는 3회 수행을 보고했지만 서버 기록은 IMAGE 4건(MISS → HIT → HIT → MISS), 누락 0건이며 모두 HTTP 200·completed=true다. 추가 요청 원인은 식별자 없는 계측으로 단정하지 않는다. 원시 기록은 `backend-texture-sdk-repeat-2026-10-25.json`에 전체 보관한다.
- 서버 전체 1344.12 → 41.19 → 31.84 → 286.49ms, 첫/마지막 S3 OPEN 1161.82/149.69ms, SERVICE_CALL 800.97/140.55ms, 인증정보 준비 0.0562/0.0433ms다. S3 재시도와 관찰 GC 증가는 0이다. 첫 요청 지연 패턴은 앞선 기록에서도 관찰됐으나 정확한 원인은 아직 분리되지 않았다.
- 설치된 AWS Apache 클라이언트 2.31.67과 Apache HttpClient 4.5.13의 바이트코드를 확인했다. 이 구현의 CONNECTION_ACQUIRE는 ConnectionRequest.get(풀에서 연결 객체를 빌리는 구간)이다. MainClientExec의 실제 route 연결과 TLS 준비는 그 뒤에 실행되므로 앞선 표의 57.12ms나 이번 47.62ms를 실제 연결 전체 시간 또는 TCP/TLS 비용의 상한으로 해석하면 안 된다. 이전 숫자는 변경하지 않고 이 해석 정정을 적용한다.

### 로컬 전용 HTTP 연결/송신/수신 경계 계측

- 수정 위치: `build.gradle.kts`, `S3Config`, `LoginDiagnostics`, 신규 `TextureHttpTransportDiagnostics`와 `TextureHttpTransportDiagnosticsTest`, 이 문서 및 `AI_3D_TEXTURE_ACCESS.md`. 기존 캐시 소스·권한 검사·응답/API/DTO/DB·사진·프론트는 이번 단계에서 수정하지 않았다.
- 로컬 전용 스위치가 켜진 때에만 SDK가 원래 만들던 Apache 클라이언트를 서비스 기본 설정 그대로 생성하고 기존 연결 관리자에 위임하는 관찰자와 기본 HttpRequestExecutor의 동일 super 실행 앞뒤 시간 기록을 붙인다. TLS 소켓 공장·신뢰 관리자·호스트 이름 검증·DNS·프록시·연결 재사용·시간 제한·재시도 설정을 새 구현으로 대체하지 않는다. 계측이 꺼지거나 prod가 함께 활성화되면 기존 SDK 기본 클라이언트 경로다.
- 공개 SDK에는 이 경계를 설치하는 훅이 없어 SDK/Apache의 한정된 내부 필드를 시작 시 1회 연결한다. 현재 기본 `ApacheHttpClient → ApacheSdkHttpClient → InternalHttpClient → ProtocolExec → MainClientExec`와 기본 HttpRequestExecutor만 허용한다. 업그레이드/다른 실행기/접근 제한으로 구조가 다르면 클라이언트를 닫고 로컬 시작 단계에서 고정 오류로 거절한다. 이때 계측 인수를 제거해 원래 경로로 시작할 수 있다. 운영 계측 수단이나 범용 클라이언트 확장으로 사용하지 않는다.
- Apache 클라이언트는 원래 S3 런타임에 있던 2.31.67을 컴파일 의존성으로 명시했다. 새 라이브러리/버전/다운로드를 추가한 것은 아니며 오프라인 dependencyInsight로 기존 BOM/런타임 경로를 확인했다.

| s3Sdk 지표 | 측정 경계 | 해석 주의 |
| --- | --- | --- |
| HTTP_CONNECT | 원래 connection manager.connect 호출 | 직접 HTTPS에서는 DNS·TCP·TLS/인증서 검증 포함. 각각의 독립 시간은 아님. 프록시 경로에서는 첫 홉 연결임 |
| HTTP_TLS_UPGRADE | 원래 manager.upgrade 호출 | 프록시 터널 뒤 TLS 등이 실행된 경우만 기록. 직접 HTTPS에 없어도 TLS가 없다는 뜻이 아님 |
| HTTP_SEND | 본문 없는 GET의 기본 doSendRequest | 요청 헤더 송신과 flush. OS/NIC의 실제 패킷 전송 완료를 보장하는 시점은 아님 |
| HTTP_RECEIVE_HEADERS | 송신/flush 뒤 기본 doReceiveResponse | 응답 대기·상태/헤더 파싱·스트림 준비. 순수 S3 처리 시간이나 정확한 첫 바이트만의 시간은 아님 |
| HTTP_TRANSPORT_OBSERVER | SDK HTTP prepareRequest 때 1 | 관찰자가 설치된 실제 요청. 캐시 HIT에는 없음 |
| HTTP_TRANSPORT_FAILURE | 관찰한 원래 작업이 실패한 경우 1 | 원래 예외는 그대로 전파하고 메시지는 저장하지 않음 |

- 위 세부 구간은 SERVICE_CALL 안의 구간이다. 상위 구간과 중복 합산하지 않는다. 연결 재사용이면 HTTP_CONNECT가 생략된다. 누락을 0으로 바꾸지 않으며, 재시도가 있으면 count/total/max와 RETRY_COUNT를 함께 읽는다. 다른 요청/스레드/종료 후 기록은 기존 소유 요청 검사로 거절한다. 숫자만 보관하고 URL·헤더·키·사진·인증정보·원문 예외·패킷·JFR 파일은 수집하지 않는다.
- 신규 테스트는 원래 인수/응답/예외/종료 위임, GET 송신·flush→헤더 수신 순서, 기존 프로필 차단, 실제 루프백 HTTP의 연결 재사용을 검사한다. 임시 시험 인증서를 쓰는 루프백 HTTPS에서 기본 신뢰 거절·명시적 시험 신뢰 통과·호스트 이름 불일치 거절도 검사한다. 실제 AWS/DB·운영 인증정보는 사용하지 않는다.
- 실제 원인 판정은 새 계측을 반영해 백엔드를 재시작한 후 같은 상세 화면에서 첫 3D 이미지 요청 1회를 받아야 한다. 이전 전환 횟수만 더 늘려도 이 새 지표는 생기지 않는다. 캐시는 그대로 유지하고 이 첫 요청에서는 연결 준비와 송신 후 헤더 대기 중 큰 구간부터 확인한다. TCP와 TLS 개별 시간, GPU 완료, 운영 성능은 아직 확인 대상이다.
- 최종 검증: 관련 11개 클래스 83개 테스트, 실패·오류·건너뜀 0개 및 bootJar 성공. 마지막 TLS 시험은 예외 종류까지 확인해 단순 연결 실패/시간 초과를 인증서 검증 성공으로 오인하지 않는다. 최종 수정 소스보다 뒤에 생성된 시험 클래스/결과를 확인했다. 전체 백엔드/프론트 테스트를 새로 모두 실행한 것은 아니다.
- 명령: `gradlew.bat --offline --no-daemon --console=plain test --tests shop.esjh.memoryjar.monitoring.TextureHttpTransportDiagnosticsTest --tests shop.esjh.memoryjar.monitoring.TextureS3DiagnosticsTest --tests shop.esjh.memoryjar.monitoring.TextureDiagnosticsTest --tests shop.esjh.memoryjar.monitoring.LoginDiagnosticsTest --tests shop.esjh.memoryjar.monitoring.ReadDiagnosticsTest --tests shop.esjh.memoryjar.monitoring.ResourceUsageEndpointTest --tests shop.esjh.memoryjar.service.jar.JarDesignTextureCacheTest --tests shop.esjh.memoryjar.service.jar.JarDesignTextureServiceTest --tests shop.esjh.memoryjar.controller.jar.JarDesignTextureControllerTest --tests shop.esjh.memoryjar.jwt.JwtAuthenticationFilterTest --tests shop.esjh.memoryjar.security.SecurityErrorHandlerTest bootJar`.
- 최초 컴파일은 원래 런타임 전용 Apache 모듈이 컴파일 경로에 없어 실패했다. 기존 버전 모듈을 명시한 뒤 최종 검증은 성공했다. 캐시 파일 SHA-256은 이전과 동일한 `8146AA2D0850F024E5395A88647F53F3A1A791ABD1DFB62FFB2412E1C0CD3F41`이며, 배포·커밋·푸시는 하지 않았다.

### 실제 HTTP 경계 첫 실측 · 2026-10-25 17:41 KST

- 새 관찰자가 설치된 IMAGE 1건, MISS·HTTP 200·completed=true, SDK publication 1회·잘림/축출 없음·재시도 0회다. 기존 숫자 기록을 새 계측으로 오해하지 않도록 HTTP_TRANSPORT_OBSERVER=1을 확인했다.
- 원시 값·집계·관련 소스 해시는 `backend-texture-transport-first-2026-10-25.json`, 쉽게 읽는 결과 표와 해석은 [작업 정리 8절](JOURNEY_2026-10-25.md#8-실제-연결-준비와-응답-대기를-나눠-봤다)에 보관한다. 요청 식별자/사진/객체 키/인증정보는 포함하지 않는다.
- 이번 단일 표본에서 실제 연결 수립이 가장 큰 구간이었다. DNS/TCP/TLS 및 그 안의 초기 준비는 아직 개별 분리되지 않았다. 브라우저 전체 전환/GPU 완료 시간은 아니며, 앞선 단일 요청보다 짧다는 이유만으로 계측 코드를 속도 개선 코드로 해석하지 않는다.
- 이 문서의 이전 절에 있는 배포·커밋·푸시 미실행 문장은 각 측정 단계의 이력이다. 이후 사용자가 main 커밋·푸시 및 기존 자동배포 시작 가능성을 승인했다. 커밋·푸시와 실제 운영 배포 성공/운영 성능 확인은 별개로 보고한다.
