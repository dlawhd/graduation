# 옛 백엔드의 동일 저금통 조회 호환 시험

`c5f58c4`의 실제 앱·인증·저금통 코드를 별도 소스 스냅샷에서 컴파일한다. 기존 작업 폴더의 앱 코드는 바꾸지 않는다.

1. 승인된 `/jars/112`의 개인정보 없는 표시 필드만 Git 제외 경로 `build/legacy-backend-compat/20261028-c5f58c4/fixture-private.json`에 준비한다. 이 도구는 운영 서버에 접속하거나 데이터를 가져오지 않는다.
2. `tools/compat/run-legacy-backend.ps1 -FixturePath <위 파일의 절대 경로>`를 실행한다. 로컬 Docker Desktop `desktop-linux`, JDK 17, 캐시된 Gradle 의존성이 필요하다.
3. 임시 MariaDB를 각각 V51과 V53까지 실제 Flyway로 구성한 다음, 옛 앱은 자기 소스의 V51 마이그레이션과 JPA 검증을 사용해 시작한다.
4. 실제 HTTP 로그인·쿠키·CSRF·멤버 권한·저금통 상세를 확인한다. 틀 좌표와 사진 배치가 조회 응답에 보존되는지 검사한다.
5. 새 `photoContours` JSON과 새 AI 스타일은 옛 코드의 지원 범위 밖이라는 경계도 검사한다. 이 오류가 예상대로 거절되는 것은 정상 데이터 조회 성공과 구분한다.

외부 제공자와 정리 스케줄러만 `@MockitoBean`으로 대체한다. S3 서명 URL은 가짜 주소이며 사진 다운로드·AWS 통신·운영 속도·브라우저 3D는 검증하지 않는다. 임시 컨테이너에는 외부 기본 경로가 없고, 운영 IP/공용 IP/메타데이터의 TCP 연결 실패를 앱 시작 전에 확인한다. 호스트 포트·Docker 소켓·AWS 설정·운영 환경변수는 전달하지 않는다.

시험 계정은 무작위로 만들며 실제 회원·암호·사진·S3 키는 사용하지 않는다. 전체 로그와 원문 fixture는 `build` 안에만 남고, 공개 가능한 결과는 `result.json`의 성공/실패 개수와 예외 종류뿐이다. 시험 종료 시 이번 실행의 label이 일치하는 임시 컨테이너와 네트워크만 정리한다. 공개 이미지와 로컬 빌드 캐시는 재실행을 위해 유지한다.

## 파일 역할

- `run-legacy-backend.ps1`: 고정 Git 소스 추출·별도 빌드·로컬 컨테이너 실행과 정리.
- `legacy-bundle.init.gradle`: 기존 앱 빌드 파일을 수정하지 않는 시험 전용 source set.
- `java/shop/esjh/memoryjar/compat/LegacyCompatibilityLauncher.java`: 외부 연결 차단·실제 DB 마이그레이션·JUnit 실행.
- `java/shop/esjh/memoryjar/compat/LegacyBackendCompatibilityTest.java`: 옛 앱의 실제 로그인·조회·권한·표시 필드 보존·호환 경계 검사.

## 2026-10-28 실행 결과

V51·V53 각각 7개, 최종 14개 검사 모두 통과했다. 검증한 앱 원본 385개 파일은 줄바꿈을 제외하고 해당 Git 커밋과 일치했다. 임시 컨테이너와 네트워크는 모두 정리했고, 명시적으로 승인받아 복사한 이번 fixture 원문도 검증 후 삭제했다. 다시 실행할 때는 승인된 입력을 먼저 준비해야 한다.

근거와 한계는 [로컬 검증 요약](../../docs/performance/3d/legacy-backend-compatibility-2026-10-28.json)과 [작업 기록](../../docs/performance/3d/PRODUCTION_COMPARISON_PLAN_2026-10-27.md)에 기록했다. 이 결과는 대상 112 데이터의 제한된 기능 호환성 검증이며 운영 속도나 전체 운영 데이터 호환성을 보장하지 않는다.

## 전체 버전의 분리된 로컬 비교

`run-local-comparison.ps1`은 위 조회 호환 시험과 별개다. 사용자 요청에 따라 실제 사진 대신 같은 480×480 합성 PNG와 공개 시험 윤곽을 사용한다. 운영에서 데이터를 가져오지 않는다.

- **before:** 기본값은 프론트·백엔드 모두 고정 커밋 `dd6e50b`(곡면 사진 최초 버전)이다. `-BaselineRef c5f58c4`로 이전 평면 사진 비교도 재현할 수 있다.
- **after:** 프론트·백엔드 모두 고정 커밋 `8a5f7cc`.
- 빈 MariaDB 두 개를 모두 같은 V53으로 구성하고 동일한 합성 계정·디자인을 넣는다. 운영 DB 구조를 바꾸지 않는다.
- 실제 HTTP 로그인·쿠키·CSRF·JWT·멤버 검사·DB 조회를 수행한다. 자동 오픈·AI/문의 정리와 외부 메일·AI·Rekognition만 시험 대역으로 막는다.
- S3Client와 Presigner는 실제 SDK이며 시험용 가짜 인증정보로 **로컬 사진 서버**를 가리킨다. AWS 연결·TLS·실제 S3 서명 검증·운영 이미지 지연은 재현하지 않는다. 사진 서버는 정해진 PNG 한 장의 읽기만 허용한다.
- 현재 코드의 서버 이미지 캐시는 그대로다. 사진 서버에는 인위적인 지연을 추가하지 않는다. 이 조건에서 얻은 전체 시간으로 이전 실제 S3 캐시 개선율을 대신 계산하지 않는다.
- Docker는 `desktop-linux`의 Windows 로컬 엔진만 허용한다. 두 앱·DB의 내부 네트워크에 외부 기본 경로가 없는지, 공용/운영/메타데이터 TCP 연결이 실패하는지 앱 시작 전에 확인한다. Docker의 내부 전용 컨테이너는 직접 포트 매핑을 하지 않으므로 별도 Java 프록시만 일반 진입 네트워크와 두 내부 네트워크에 연결한다. 프록시는 정해진 두 앱·사진 서버로만 전달하고, 자격 증명·DB·앱 소스는 마운트하지 않는다. 프록시의 세 포트와 Node 화면도 PC loopback으로만 공개한다. DB 포트는 공개하지 않는다.
- 소스는 Git archive로 별도 추출한다. 기존 앱 소스·일반 dist·Git 이력·운영 환경변수는 바꾸지 않는다. 두 커밋의 package/lock이 같을 때만 기존 설치 의존성을 재사용한다.
- 브라우저 비교용 빌드에는 원본 계산·그리기를 바꾸지 않는 관찰 호출과 380×380 CSS만 추가한다. Node 테스트는 관찰 호출을 제거했을 때 원본 파일이 그대로 복원되는지도 확인한다.

실행:

```powershell
./tools/compat/run-local-comparison.ps1 -BaselineRef dd6e50b
```

직전 `8a5f7cc`와 현재 계산 파일 수정본만 비교하려면 다음을 사용한다. 양쪽 백엔드·캐시는 동일한 `8a5f7cc`다.

```powershell
./tools/compat/run-local-comparison.ps1 -BaselineRef 8a5f7cc -WorkingFrontend
```

이 모드는 HEAD가 `8a5f7cc`와 같고 프론트 앱 변경이 `body3DMesh.mjs`·`body3DBase.mjs` 두 파일 안에 있을 때만 실행한다. 기준 소스는 유지하고 `after` 스냅샷의 두 파일만 복사한다. 다른 앱 변경·미추적 앱 소스·허용하지 않은 기준 커밋은 거절한다. 실행 명세·화면·JSON에 작업 수정본임을 표시하고 파일 해시를 보관한다. 커밋된 코드와 작업 수정본을 혼동하지 않는다. [추가 최적화 결과](../../docs/performance/3d/FOLLOWUP_3D_OPTIMIZATION_2026-10-29.md)에 최종 24회·동일 모양·테스트 근거를 보관했다.

과거 `dd6e50b`에서 최종 수정본까지의 차이를 직접 확인하려면 `./tools/compat/run-local-comparison.ps1 -BaselineRef dd6e50b -WorkingFrontend`를 사용한다. 이때 `before` 프론트·백엔드는 모두 `dd6e50b`, `after` 백엔드는 `8a5f7cc`이고 프론트는 그 기준의 두 계산 파일 수정본이다. 과거 스냅샷도 그 과거 커밋과 대조하며 수정하지 않는다. 중간 개선율을 더하거나 곱하는 대신 같은 실험에서 양쪽을 측정한다. [최종 직접 비교 결과](../../docs/performance/3d/FINAL_DIRECT_3D_COMPARISON_2026-10-29.md)에 24회 원시 기록과 검증 근거를 보관했다.

화면을 남기지 않고 새 폴더의 빌드·시작·실제 HTTP/캐시 검증·정리까지 한 번에 확인하려면 `./tools/compat/run-local-comparison.ps1 -VerifyOnly`를 사용한다. 이 모드는 브라우저 속도를 측정하지 않는다.

표시된 두 시작 주소에서 시험 계정 로그인 버튼을 누른다. 기존 오픈 안내와 튜토리얼을 실제 버튼으로 닫고, 2D 사진이 준비된 뒤 활성 탭에서 ‘6회 자동 측정’을 실행한다. 버튼은 본체를 화면 중앙으로 맞춘 뒤 측정하며 영역 전체가 보이지 않으면 유효 기록으로 세지 않는다. 첫 전환과 반복 5회는 구분한다. 다른 탭에서 동시에 측정하지 않는다. 패널의 ‘사진 및 그리기 준비’와 ‘그 뒤 두 번의 rAF 관측’은 실제 모니터 표시나 GPU 완료 시간이 아니다. rAF(requestAnimationFrame)는 브라우저가 다음 화면 갱신을 준비할 때 호출하는 함수다.

`c5f58c4`는 평면 사진, `dd6e50b`와 현재 버전은 곡면 사진을 사용한다. 곡면 두 버전은 테두리와 사진 텍스처가 모두 준비된 그리기 반환을 기다린다. 기준 커밋은 실행 명세·빌드·화면 JSON에 전체 해시로 기록한다. `local-comparison-geometry.mjs <실행 폴더>`는 각 버전의 실제 모양 생성 코드를 불러와 같은 입력의 좌표·법선·UV·삼각형·재질 그룹을 대조한다. **역사 버전 전체의 비교이므로, 모양 일치만으로 모든 기능·모든 입력이 같거나 순수 계산 최적화만의 효과라고 단정하지 않는다.** 사진 표시·회전·정면 복귀·2D 재전환도 별도로 확인한다. 숨겨진 탭·시간 초과·실패는 성공 통계에 넣지 않는다.

종료:

```powershell
./tools/compat/run-local-comparison.ps1 -Stop -RunRoot <시작할 때 출력된 실행 폴더의 절대 경로>
```

해당 실행 폴더와 label이 일치하는 임시 컨테이너·네트워크만 정리한다. 결과 파일은 Git 제외 폴더에 남긴다. 앱과 게이트웨이는 2시간 뒤 종료하며, 컨테이너·네트워크 정리는 위 명령으로 마친다. 실제 로그인 정보 대신 무작위 시험 비밀번호를 사용하고 계정 원문은 Git에 넣지 않는다.

도구 검증: `node --test tools/compat/local-comparison.test.mjs`. 사진 서버는 시작 전에 실제 loopback HTTP의 PNG 일치·경로 제한·삭제/업로드 거절·출처 제한 10항목을 검사한다. 프록시는 고정 실행 ID와 실제 TCP 양방향 전달·반쪽 종료 3항목을 확인한다. 각 앱도 시작 전 7가지 HTTP 권한/조회 시나리오를 확인한다. 성공 결과는 실행 폴더의 공개 숫자 JSON으로 확인하고, 실패 원문은 로컬 시험 로그에서만 확인한다. 화면 안내는 실제 건너뛰기 API로 시험 DB에만 저장하며, 디자인 생성·삭제·사진 업로드 API는 게이트웨이에서 거절한다.

추가 실제 HTTP 검증은 `node tools/compat/local-comparison-check.mjs <실행 폴더 절대 경로>`다. 두 버전의 같은 PNG 바이트·표시 필드와 현재 캐시의 권한 검사 등 30항목을 확인한다. 측정이 끝난 뒤 실행한다. 사진 요청으로 캐시가 준비될 수 있으므로 성능 측정과 동시에 실행하지 않는다.

파일 역할:

- `run-local-comparison.ps1`: 고정 소스 두 개의 빌드·네트워크/DB 시작·준비 확인·해당 실행만 종료.
- `local-comparison.mjs`: 기존 의존성을 사용한 Vite 빌드, 되돌릴 수 있는 메모리 내 관찰 호출, loopback 화면/API 게이트웨이.
- `local-comparison-monitor.mjs`: 명시적 자동 측정 버튼, 가시성 검사와 숫자 JSON 표시/저장.
- `local-comparison.test.mjs`: 관찰 코드 원본 보존과 게이트웨이 제한의 Node 테스트.
- `local-comparison-check.mjs`: 실제 로그인·PNG 일치·캐시 재사용 뒤 권한을 확인하는 HTTP 검사.
- `java/shop/esjh/memoryjar/compat/LocalComparisonLauncher.java`: 외부 차단 확인과 실제 DB 마이그레이션·세션 시험 실행.
- `java/shop/esjh/memoryjar/compat/LocalComparisonSessionTest.java`: 합성 데이터·실제 권한 사전 검사와 제한된 세션 유지.
- `java/shop/esjh/memoryjar/compat/LocalFixtureServer.java`: 고정 합성 PNG 읽기 전용 서버.
- `java/shop/esjh/memoryjar/compat/LocalFixtureServerCheck.java`: 사진 서버의 실제 HTTP 경계 검사.
- `ingress/LocalIngressProxy.java`: 내부 앱의 외부 경로를 만들지 않고 PC 요청만 고정 목적지로 전달하는 진입 프록시.

2026-10-29의 첫 평면 사진 버전 비교는 [이전 결과 설명](../../docs/performance/3d/LOCAL_RELEASE_COMPARISON_2026-10-29.md), 이후 사용자가 지정한 `dd6e50b` 곡면 사진 기준의 재검증은 [새 결과 설명](../../docs/performance/3d/CURVED_PHOTO_COMPARISON_2026-10-29.md)을 본다. 기존 10월 28일의 승인된 운영 표시 필드 조회 시험과 합성 데이터 비교도 구분한다.

곡면 사진 재검증은 기준→현재→현재→기준 순서로 새 문서마다 6회씩 측정했다. 최종 24회·동일 모양 해시·관련 테스트·정리 검증을 통과한 뒤 `summarize-curved-comparison.py <실행 폴더>`로 새 문서와 공개 JSON을 작성했다. 도구는 완료되지 않은 기록·다른 커밋·다른 화면 크기·남은 시험 자원이 있으면 결과 확정을 거절한다. 원시 브라우저 기록과 테스트 산출물·정리 확인 JSON이 모두 준비되어야 한다.

최종 실행기를 새 실행 폴더에서 `-VerifyOnly`로 재현해 두 버전의 빌드·시작·HTTP 30항목·정리까지 종료 코드 0으로 통과했다. 두 실행의 빌드 명세·합성 이미지·관찰 코드 해시도 같았다. 측정 실행과 재현 실행의 임시 컨테이너·네트워크·시험 포트는 모두 정리했다. 공개 가능한 결과는 위 설명과 JSON에 보관하며 원시 시험 계정과 로그는 Git 제외 폴더에만 둔다.
