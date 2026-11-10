# 첨부 비공개·운영자 추가 인증·보안 자동화

기준 프로젝트는 `C:/Users/whdgu/Desktop/graduation`, 시작 HEAD는 `81a3fb3d2f06b56c942b0b2f0ad15122a6334cd5`이다. 로컬 코드, 운영 설정, GitHub 설정을 구분한다. 운영 S3 설정 반영과 애플리케이션 코드의 커밋·배포는 별도 단계다. 이 문서의 운영 검증은 기존 API 버전에서 수행했으며, 추가 인증의 운영 등록과 새 버전 배포 성공은 별도 확인이 필요하다.

## 1. 운영 사진은 실제로 비공개였나?

### 문제 → 원인

코드에 멤버·작성자 검사와 짧게 만료되는 읽기 주소가 있어도, 예전에 공개한 S3 주소까지 막히는 것은 아니었다. 관리자 화면에서 확인한 상태는 다음과 같다.

- 버킷 전체의 익명 `GetObject`를 허용하는 `PublicRead` 정책이 있었다.
- 버킷의 퍼블릭 액세스 차단 네 항목은 모두 꺼져 있었다.
- 객체 소유권은 `Bucket owner enforced`로 ACL이 비활성화돼 있었다. 이번 표본의 공개 원인은 개별 ACL이 아닌 버킷 정책이었다.
- 기존 문의 사진 차단은 `support-inquiries/*`에만 적용됐다. 현재 별도 화면 첨부 경로는 `support-attachments/*`다.
- 현재 AWS 계정의 CloudFront 배포는 0건이었다. 앱에 설정된 기본 주소도 S3 직접 주소였다. 이미 내려받은 사본이나 임의의 외부 캐시까지 회수했다는 뜻은 아니다.

처음 SSH로 점검할 때 API 역할에는 버킷 정책·파일 목록 조회 권한이 없어 403이 나왔다. 이것을 ‘사진이 비공개다’라는 증거로 쓰지 않았고, 점검 때문에 실행 역할의 권한을 넓히지도 않았다.

### 해결 → 운영 검증

기존 정책을 읽어 보관한 뒤, 현재 파일 경로 여섯 개(`notes`, `profiles`, `jars`, `support-attachments`, `jar-design-drafts`, `jar-designs`)에 실행 역할 이외의 읽기를 거절하는 문장을 추가했다. 기존 `support-inquiries` 차단은 유지했다. AI 사진도 현재 코드가 권한 검사 후 서명 주소를 발급하는 것을 대조했다.

사진 내용을 내려받지 않고 같은 기존 쪽지 사진 한 건의 HEAD(응답 헤더만 확인하는 요청)를 비교했다. 사진·객체 경로·서명·자격 증명은 이 문서에 저장하지 않았다.

| 같은 표본에 대한 요청 | 적용 전 | 경로별 차단 적용 후 | 전체 공개 차단 최종 적용 후 |
| --- | ---: | ---: | ---: |
| 인증 없는 S3 직접 주소 | 200 | **403** | **403** |
| 앱에 설정된 공개 기본 주소 | 200 | **403** | **403** |
| 기존 EC2 실행 역할의 서명 요청 | 200 | **200** | **200** |

당시 API 컨테이너의 revision 라벨은 시작 HEAD와 같았다. HEAD와 배포 이미지 식별을 확인한 것이며, 로그인한 브라우저에서 모든 사진·영상 재생을 새로 시험한 것은 아니다.

**2026-11-10 사용자의 구체적인 적용 승인 후, 전체 공개 허용 제거와 버킷 공개 차단 네 항목 활성화를 완료했다.** 처음에는 자동 승인 검토가 명시적인 운영 권한 변경 승인이 없다는 이유로 저장을 차단했지만, 사용자의 승인 후 정식 화면에서 저장했다. 우회 실행은 하지 않았다.

최종 저장된 JSON이 준비한 정책과 같은지 대조했고 `PublicRead`가 제거된 것을 확인했다. 현재 6개 경로와 기존 `support-inquiries/*`의 읽기는 실행 역할에 명시적으로 허용해 기존 문의 기능을 보존했다. 공개 차단 네 항목이 저장 후 모두 활성화된 것도 관리자 화면에서 확인했다. 마지막으로 같은 사진 표본의 익명 403·서명 200을 재검증했다. 사진 내용·DB·업로드 권한·애플리케이션 컨테이너는 변경하지 않았다.

[최종 정책 템플릿](../tools/security/private-attachment-policy.template.json)은 현재·이전 문의 경로를 포함한 7개 경로의 실행 역할 읽기를 보장한다. 실제 버킷·계정을 대입하고 기존 정책과 병합·대조해야 하며 무조건 전체 정책을 덮어쓰는 도구가 아니다. 실제 적용에서는 기존 문의 차단 문장을 유지했다. 이미 발급한 짧은 서명 주소는 만료까지 유효할 수 있다.

[읽기 전용 점검기](../tools/security/audit-private-attachments.py)는 API 호스트에서 실행한다. 설정 조회 실패는 미확인으로 남기며 파일에는 HEAD와 ACL 메타데이터만 요청한다. 사진 본문·파일명·정책 원문·서명을 결과에 포함하지 않는다.

## 2. 운영 문의함의 추가 인증

### 기존 동작과 변경

기존에는 서버의 운영자 허용 목록에 있는 로그인 계정이면 운영 문의를 사용할 수 있었다. 일반 로그인 쿠키만 탈취당했을 때 문의와 사진까지 열리는 위험을 줄이도록 인증 앱의 6자리 번호를 한 번 더 확인한다.

1. 운영자 허용 목록과 현재 로그인 생존 여부를 먼저 검사한다. 저금통 관리자 권한은 운영자 권한으로 사용하지 않는다.
2. 최초 등록에는 서버 소유자가 별도 전달한 난수 코드가 필요하다. 일반 로그인만 탈취한 사람이 자기 인증 앱을 먼저 등록하지 못하게 한다.
3. 인증 앱의 ‘계정 추가 → 설정 키 직접 입력’에서 시간 기반을 선택한다. 외부 QR 서비스로 비밀키를 보내지 않는다. 등록은 시작한 기기에서 5분 안에 확인해야 한다.
4. 번호 확인 후에만 등록을 확정한다. 설정 키는 독립 256비트 서버 키로 AES-GCM 암호화하고 사용자 번호도 묶는다. 암호문을 다른 사용자 행으로 옮기면 해독되지 않는다.
5. TOTP(30초마다 바뀌는 인증 앱 번호)는 표준 HMAC-SHA1·6자리 규격이다. 앞뒤 한 구간의 시계 차이를 허용하고 사용한 구간은 다시 쓰지 못하게 한다.
6. 추가 인증은 현재 로그인 묶음에만 **15분** 부여한다. 다른 기기·새 로그인에는 승계하지 않는다. 로그아웃·비밀번호 변경·운영자 제외도 서버에서 차단한다.
7. 운영 문의 컨트롤러의 공통 `@ModelAttribute`가 목록·상세·원본·첨부·대화·답변·해결·재문의·첨부 업로드를 모두 검사한다. 일반·게스트 문의는 유지한다.
8. 만료 또는 서버의 `OPERATOR_MFA_REQUIRED` 응답을 받으면 문의 자식 화면을 제거한다. 같은 로그인 탭의 잠금 신호도 반영한다. 일반 로그인 자체를 지우지는 않는다.

기존 실시간 신호·고정된 알림 문구에는 본문·사진이 없다. 실제 문의 내용과 사진을 다시 요청할 때 REST에서 추가 인증을 검사한다. 쪽지·채팅까지 끊도록 공용 소켓 전체를 잠그지는 않는다.

### 복구·동시성·요청 제한

- 128비트 난수 복구 코드 10개를 한 번만 보여준다. 서버에는 사용자·용도가 분리된 HMAC 해시만 저장한다. 키·번호·복구 코드를 브라우저 저장소에 남기지 않는다.
- 각 복구 코드는 한 번만 쓴다. 새 인증 앱 번호로 복구 목록을 재발급하면 이전 목록은 무효다. 최초 등록 코드로 이미 등록된 인증 앱을 덮어쓸 수는 없다.
- `사용자 → 인증정보 → 기기 인증` 순서로 변경을 직렬화한다. 같은 번호·복구 코드의 동시 요청은 한 번만 성공한다. 만료 정리와 재인증이 겹쳐도 한 SQL의 원자적 저장으로 처리한다.
- 등록 시작은 계정당 15분 5회, 번호 확인·복구·복구 재발급은 합쳐 15분 10회다. 실패로 업무 트랜잭션이 롤백돼도 시도 횟수는 되돌리지 않는다. 초과는 429다.
- 만료 기기 인증은 기존 보안 스케줄러에서 매분 최대 500개 정리한다. 외부 I/O는 추가하지 않았다.

### 서버 설정과 실제 등록 순서

| 백엔드 환경변수 | 의미 |
| --- | --- |
| `APP_SUPPORT_MFA_ENCRYPTION_KEY` | 32바이트 난수의 Base64. 인증 앱 설정 키를 암호화하는 독립 키 |
| `APP_SUPPORT_MFA_BOOTSTRAP_SECRET` | 32~256자 난수. 최초 등록하는 운영자에게 안전한 경로로만 전달 |

`VITE_`로 넣거나 값 자체를 소스·GitHub에 커밋하면 안 된다. `python -B tools/security/create-operator-mfa-config.py`는 Git에서 제외한 `build/operator-mfa-private/runtime.env`를 새로 만들고 실제 값을 출력하지 않는다. 기존 파일은 덮어쓰지 않으며 Windows에서는 비밀값을 쓰기 전에 현재 사용자만 접근하도록 파일 권한을 제한한다.

이번 작업에서 해당 비공개 설정 파일을 생성했고 Git 제외·권한 상속 제거·현재 사용자 한 개의 명시적 권한을 확인했다. 실제 값은 출력하지 않았으며 서버에 전송하거나 실행 중인 컨테이너에 적용하지 않았다.

1. 암호화 키를 별도 안전한 장소에 백업한다. 컨테이너 교체 때마다 새로 만들면 기존 인증 앱 키를 읽을 수 없게 된다.
2. 기존 서버 환경 설정에 두 값을 주입한다. 파일 생성만으로 현재 컨테이너나 배포가 변경되지는 않는다.
3. V61·백엔드·프론트를 함께 반영한다. 키가 빠져도 일반 기능은 유지하지만 운영 문의는 열리지 않는다. 자동 우회 기본값은 없다.
4. 운영자가 로그인하고 최초 등록 코드·인증 앱 설정·6자리 확인·복구 코드 보관을 직접 완료한다.
5. 실제 운영에서 잠금·재인증·원본·첨부·답변을 확인한다. 전원 등록 후 최초 등록 코드 설정을 제거해 신규 등록을 닫을 수 있다. 암호화 키는 보존한다.

앱과 복구 코드를 모두 잃었다면 로그인만으로 재등록하는 우회 API는 제공하지 않는다. 서버 소유자가 본인 확인 후 해당 계정의 인증정보와 모든 기기 인증을 함께 폐기하고 최초 등록부터 진행해야 한다. 복구 해시·기기 키는 기존 인증용 HMAC 설정에도 의존하므로 그 설정을 회전할 때 복구 코드 재발급도 계획한다.

## 3. 보안 검사 자동화

### GitHub에서 실제 확인·적용

- 키 패턴 탐지와 해당 키가 포함된 푸시 차단은 이미 켜져 있어 유지했다.
- 의존성 취약점 알림과 Dependabot 보안 업데이트 PR을 활성화하고 `enabled=true`, `paused=false`를 확인했다.
- 미해결 키 탐지 경고는 조회 시점 0건이었다. 지원되는 패턴의 결과이며 모든 비밀값이 없다는 증명은 아니다.
- 프론트 `package-lock.json`에는 의존성 경고 64건(높음 27·중간 34·낮음 3)이 있었다. 실제로 악용 가능한 서비스 버그 64개라는 뜻은 아니다. 자동화 활성화와 의존성 수정·호환성 검증은 구분한다. 관련 없는 대규모 버전 변경·자동 병합은 하지 않았다.

### 소스에 추가

- `.github/dependabot.yml`: Gradle·프론트 npm·GitHub Actions·Docker의 주간 갱신 PR.
- `.github/workflows/security.yml`: push·PR·주간·수동 CodeQL 검사. Java/Kotlin과 JavaScript/TypeScript를 분석한다. Java는 컴파일만 하고 서비스·DB·실제 메일을 시작하지 않는다.
- PR 의존성 검사: 새로 추가·변경된 의존성의 높은 위험 경고에서 실패한다. 기존 경고 전체를 없애는 설정은 아니다.
- GitHub 호스팅 러너만 사용하고 운영 self-hosted 러너·운영 비밀값·배포 스크립트와 연결하지 않는다. `pull_request_target`은 쓰지 않는다.
- 공식 Action의 고정 커밋을 사용하고 Dependabot으로 갱신한다. 공식 actionlint 배포본의 SHA-256을 대조해 워크플로 문법을 검사했다.
- 실제 CodeQL 실행은 새 파일을 GitHub에 반영한 뒤 확인해야 한다. 필수 검사로 병합을 차단하는 저장소 규칙은 이번에 변경하지 않았다.

## 4. API·DB·호환성

기존 문의 DTO·경로와 `/api/v1/support/permissions`는 유지한다. 새 경로는 `/api/v1/admin/support/mfa`다.

| 요청 | 역할 |
| --- | --- |
| `GET /api/v1/admin/support/mfa` | 설정·등록 여부, 현재 기기의 인증 만료 시각 |
| `POST .../enrollment` | `{bootstrapCode}`로 등록 시작 |
| `POST .../confirmation` | `{code}`로 등록 확정·복구 코드 발급 |
| `POST .../verification` | `{code,recovery}`로 앱 번호 또는 복구 코드 확인 |
| `POST .../recovery-codes` | `{code}`로 복구 목록 교체 |
| `POST .../lock` | 현재 로그인 묶음의 추가 인증 폐기 |

모든 경로는 로그인·기존 CSRF·CORS 검사를 유지하고 `no-store`를 사용한다. 날짜는 UTC `Z` 표기다. 키 미설정 시 상태는 `configured=false`, 등록·검증은 503이다. 운영 자료는 추가 인증이 없으면 403 / `OPERATOR_MFA_REQUIRED`다. 기기 식별이 없는 이전 로그인은 다시 로그인해야 한다.

V61의 `operator_mfa_credentials`와 `operator_mfa_proofs` 두 테이블을 추가한다. 기존 마이그레이션은 수정하지 않았다. 사용자 FK·암호화 키·복구 해시·기기 만료·로그인 버전을 사용한다.

## 5. 검증과 남은 사항

| 검사 | 결과 |
| --- | --- |
| 표준 번호·암호문 변조·재사용·MariaDB 등록·동시 복구·기기 격리·로그아웃·만료·REST 차단 | 관련 로컬 테스트 통과 |
| 실제 React + 별도 Chrome | 모바일·복구·탭 잠금·만료·이전 계정 응답 3건 통과 |
| 기존 프론트 전체 | 323건 통과 |
| 프론트 빌드 | 성공, 기존 큰 청크 경고 유지 |
| 키 생성기·읽기 전용 점검 도구 | Python 5건 통과 |
| 새 워크플로 문법 | actionlint 통과 |
| 전체 백엔드 및 JAR | **2,233건 중 2,225 통과·실패 0·조건부 제외 8**, 빌드 성공 |
| 마지막 키 길이·인증 변경 재검증 및 최종 JAR | 관련 **41건 통과·실패 0**, 빌드 성공. 전체 건수와 중복이므로 합산하지 않음 |
| 최종 패키지·설정 보호 | MFA 클래스·V61 포함, 로컬 설정·시험 헬퍼·비공개 env 제외. 변경 소스 36개에서 새로 생성한 키 원문 일치 0건 |
| 실제 운영자 인증 앱 등록·새 코드의 운영 UI | 미배포로 미실행 |

이 문서의 로컬 검증 과정에서는 실제 메일·유료 AI·운영 DB 쓰기·새 컨테이너 배포를 하지 않았다. 운영 S3 변경·HEAD 확인·GitHub 보안 활성화는 위에서 별도로 명시한 실제 운영 작업이다.

조건부 제외 8건은 실제 HTTP/STOMP 6건, 읽기 부하 1건, 300명 문의 시나리오 1건이다. 300명 시험의 운영자 준비도 실제 기기 로그인과 MFA 등록·확인을 거치도록 수정하고 컴파일했지만, 이번 단계에서 그 부하 시험을 실행했다고 주장하지 않는다. 전체 테스트 뒤 변경한 인증 키 길이 상한은 마지막 41건으로 재검증했고 프론트 빌드·Chrome 3건도 최종 소스로 다시 확인했다.

## 6. 주요 변경 파일과 영향 범위

| 범위 | 파일 |
| --- | --- |
| 운영 REST 진입점 | `controller/support/SupportAdminController.java`, `OperatorMfaController.java` |
| 인증 규칙·암호화·오류 구분 | `service/support/OperatorMfaService.java`, `security/OperatorMfaCrypto.java`, `OperatorMfaRequiredException.java`, `config/exception/OperatorMfaExceptionHandler.java` |
| DB·설정 | `entity/support/OperatorMfaCredential.java`, `OperatorMfaProof.java`, 대응 Repository 2개, `V61__operator_additional_authentication.sql`, `application.yml` |
| 운영 화면·API | `frontend/src/features/support/OperatorMfaGate.jsx`, `pages/SupportInquiriesPage.jsx`, `api/operatorMfaApi.js`, `operatorMfaEvents.mjs`, `apiClient.js` |
| GitHub 자동화 | `.github/dependabot.yml`, `.github/workflows/security.yml` |
| 운영 점검·키 준비 | `tools/security/audit-private-attachments.py`, `create-operator-mfa-config.py`, `private-attachment-policy.template.json` |
| 회귀 검증 | MFA 암호화·MariaDB·REST 테스트 3개, `SecurityConfigTest.java`, `IsolatedSupport300Test.java`, 시험용 `OperatorMfaTestCodes.java`, Chrome 시험 1개·Python 시험 2개 |

백엔드 Java 경로의 기준은 `src/main/java/shop/esjh/memoryjar`다. 신규 클래스에는 역할·핵심 권한·잠금 이유 주석을 넣었다. 기존 사용자 DTO·일반 문의·채팅·쪽지·AI 처리 방식을 대규모로 재구성하거나 실행 라이브러리를 추가하지 않았다.

## 참고

- [OWASP 추가 인증](https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html)
- [AWS S3 공개 차단](https://docs.aws.amazon.com/AmazonS3/latest/userguide/access-control-block-public-access.html)
- [GitHub 보안 기능](https://docs.github.com/en/code-security/tutorials/secure-your-organization/protect-against-threats)
