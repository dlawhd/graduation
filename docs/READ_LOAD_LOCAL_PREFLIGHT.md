# 조회 부하 시험의 로컬 사전 검증

## 범위와 기준값 원칙

이번 단계는 시험 계정·데이터 생성, 실제 로그인·조회 경로, 응답 검증·중단 조건의 기능 검증이다.
**로컬 응답 시간·처리량은 EC2 성능 기준값이나 개선 성과로 사용하지 않는다.**
성능 기준값은 이후 승인된 점검 시간에 실제 EC2에서 동일 조건으로 측정한 원본 결과로만 정한다.
이 도구는 운영 DB에 데이터를 생성하거나 EC2에 부하를 보내지 않는다. 커밋·푸시·배포도 별도 작업이다.

## 재사용한 구현과 변경 범위

프로젝트 루트: `C:/Users/whdgu/Desktop/graduation`.

| 변경 파일 (루트 기준) | 역할 |
| --- | --- |
| `src/test/java/shop/esjh/memoryjar/isolated/IsolatedReadScenarioTest.java` | 전용 계정·데이터 생성, 실제 조회 후 DB 행 수·외부 호출 검사 |
| `src/test/java/shop/esjh/memoryjar/isolated/IsolatedE2eLauncher.java` | 기존 4개 E2E와 신규 조회 검사 선택 실행 |
| `tools/isolated/run-e2e.ps1` | 선택 옵션·k6 격리 컨테이너 실행·종료 시 정리 |
| `tools/load/read-local.js` | 실제 로그인과 30회 조회·k6 threshold |
| `tools/load/read-contract.mjs` | 대상 주소·시험 데이터·응답 계약·조회 비율·중단 기준 |
| `tools/load/read-contract.test.mjs` | 응답 계약과 잘못된 입력 검사 |
| `tools/load/test_read_abort.py` | 실제 k6의 정상 종료·오류·지연 중단 검사 |
| `docs/READ_LOAD_LOCAL_PREFLIGHT.md` | 실행 방법·범위·기준값 원칙·검증 결과 |
| `docs/RESOURCE_MONITORING.md` | EC2 준비와 로컬 검증의 구분·상세 문서 연결 |

- 기존 `tools/isolated/run-e2e.ps1`, Docker internal 네트워크, 임시 MariaDB, 실제 Spring HTTP 서버를 재사용한다.
- 기본 E2E 실행은 기존 HTTP·이메일·WebSocket·관리 포트 검사 4개를 유지한다.
- `-ReadPreflight`를 지정할 때만 별도의 조회 사전 검증 클래스와 k6를 실행한다.
- 서비스 소스·API/DTO·Security·DB migration·Heap·풀 크기는 변경하지 않는다.
- PC에 설치된 버전과 같은 `grafana/k6:0.34.1` 공개 이미지를 사용한다. 최초에는 이미지 다운로드가 필요하다.
  오래된 k6의 기능을 추정하지 않고 설치 버전에서 실제 스크립트 실행·중단을 확인한다.
  버전 업그레이드는 이번 단계에 섞지 않으며, 향후 변경 시 EC2 전후 측정 조건에도 기록한다.

## 시험 데이터

| 항목 | 구성 |
| --- | --- |
| 계정 | 고유 run ID를 붙인 LOCAL 계정 10개, 가짜 example.invalid 이메일, 계정마다 난수 비밀번호 |
| 비밀번호 처리 | 기존 운영용 PasswordEncoder Bean의 Argon2 설정 재사용 |
| 저금통 | 기본 테마 3개, 각 계정이 모두 참여, 저금통마다 멤버 10명 |
| 쪽지 | 저금통당 40개·총 120개, 고정 시험 문장 20회 반복, 작성자는 10명 순환 |
| 오픈 상태 | ALL_AT_ONCE·오픈 기록까지 미리 저장. 조회 중 보정 오픈·SYSTEM 채팅 저장 방지 |
| 제외 | 이미지·첨부·AI 디자인·리액션·댓글 없음. 복잡한 대형 데이터 분포를 대표하지 않음 |

계정 생성은 공개 회원가입·메일 인증 API를 거치지 않고 **검증한 임시 DB에만** 기존 Entity로 저장한다.
이 로컬 단계에서는 운영 DB용 생성 경로를 실행하지 않았다.
이후 승인한 운영 준비 결과는 [EC2 준비 기록](EC2_READ_TEST_PREPARATION.md)에 별도로 남긴다.
실제 JDBC의 host=db, 기본 포트 3306, DB=isolated_e2e를 확인한 뒤에만 데이터를 만든다.

## 조회와 판정

준비 단계에서 계정 10개를 순서대로 CSRF → 로그인 → 내 정보 → 내 저금통 목록으로 확인한다.
반복 로그인·메일·회원가입을 조회 부하 루프에 넣지 않는다.
JWT와 인증 쿠키는 k6 메모리 안에서만 사용하고 콘솔·측정 JSON에 출력하지 않는다.
로그인으로 Refresh Token 10개가 생성되는 것은 예상한 준비 단계의 쓰기다.

| 반복 조회 API | 비율 | 검사 |
| --- | --- | --- |
| GET /api/v1/jars?page=0&size=20 | 30% | 허용한 저금통 ID 3개, 이름·역할·멤버 수·오픈 상태·페이지 메타데이터 |
| GET /api/v1/jars/{jarId} | 30% | 지정한 저금통 ID·소유자·내 역할·멤버 수·오픈 상태 |
| GET /api/v1/jars/{jarId}/notes?page=0 또는 1&size=20 | 40% | 페이지별 정확한 쪽지 ID·순서·전체 개수·작성자 범위·가상 제목·첨부 없음 |

로컬 실행은 **1 VU·30회 조회**로 목록 9·상세 9·쪽지 12회다. 10 VU 부하 시험이 아니다.
준비 요청은 phase=prepare, 반복 조회는 phase=read 태그로 분리한다.
HTTP 200만 확인하지 않고 실제 데이터·JSON 계약까지 맞아야 성공이다.
이미지 URL을 추적하거나 리다이렉트를 따라가지 않는다. 요청 제한 시간은 3초다.

- API별 read 요청 p95 ≤500ms, 응답·계약 오류율 <1%를 threshold로 연결한다.
- `abortOnFail=true`, `delayAbortEval=10s`를 사용한다. 10초는 중단 평가 지연이며 warm-up 데이터를 제거하는 옵션이 아니다.
- 시험 종료 시에도 threshold를 판정한다. 각 API의 관측 수가 0이면 성공으로 처리하지 않는다.
- 지연·오류를 넣는 대역 검사는 실제 k6의 비정상 종료 코드와 400회 완료 전 종료를 함께 확인한다.
- 로컬의 판정 통과는 조건 연결 확인일 뿐 EC2의 p95 합격을 뜻하지 않는다.

threshold 문법은 [k6 공식 문서](https://grafana.com/docs/k6/latest/using-k6/thresholds/)를 참고하고 설치 버전에서 실행 검증한다.
기존 [자원 감시기](RESOURCE_MONITORING.md)의 CPU·Heap·DB 풀·수집 끊김 중단 장치와는 별도 계층이다.
k6 자체가 실패 종료하면 감시기도 `LOAD_FAILED`로 구분하는 기존 경로를 사용한다.
이번 로컬 실행은 SSH 자원 감시기로 EC2에 연결하지 않는다.

## 외부 호출·운영 데이터 보호

- DB·서버·k6를 같은 GUID 전용 internal 네트워크에 배치한다. 호스트 포트는 열지 않는다.
- 실행 컨테이너에 호스트 AWS 설정·비밀 환경변수·Docker 소켓을 전달하지 않는다.
- Spring 실행 전 외부 IPv4·IPv6·메타데이터 TCP 실패와 기본 외부 경로 부재를 검사한다.
- Cloudflare·Rekognition·SES·S3Client·S3Presigner는 대역이며 시험 종료 시 호출 0건을 검증한다.
- k6는 정확히 loopback 주소 또는 격리 모드의 app:8080만 허용한다. EC2·임의 도메인 주소를 거절한다.
- k6의 익명 사용 통계 전송도 `--no-usage-report`로 끈다.
- 사용한 가짜 계정 비밀번호는 무시되는 build/ 아래 fixture 파일에만 남는다. 공유·커밋하지 않는다.
- 종료 시 이번 실행이 만든 컨테이너·네트워크·tmpfs DB만 정리한다. 기존 로컬 DB는 보존한다.
- 로그인 준비 외의 사용자·저금통·멤버·쪽지·오픈 기록·채팅·첨부·디자인·알림 행 수가 전후 동일한지 검사한다.
  행 수 비교는 모든 열의 불변성이나 전체 서비스 정합성을 증명하는 검사는 아니다.

## 실행

PC PowerShell의 프로젝트 루트에서 Java 17과 로컬 Docker Desktop을 사용한다.

```powershell
node --test tools/load/read-contract.test.mjs
python -B tools/load/test_read_abort.py
$env:JAVA_HOME='C:\Users\whdgu\.jdks\corretto-17.0.10'
$env:AWS_EC2_METADATA_DISABLED='true'
.\tools\isolated\run-e2e.ps1 -ReadPreflight

# 기존 4개 E2E의 회귀 검사
.\tools\isolated\run-e2e.ps1
```

결과는 실행별 `build/isolated-e2e-results/memoryjar-e2e-<GUID>/`에 보존한다.
`read-summary.json`, `read-metrics.jsonl`, `read-verification.json`, `summary.txt`, `egress.txt`를 구분한다.
성능 비교 자료에는 나중에 실제 EC2에서 수집한 별도 결과만 사용한다.

## 2026-10-18 최종 검증 결과

| 실행 | 결과 |
| --- | --- |
| Node 응답·fixture·threshold 계약 검사 | 13개 통과 |
| 로컬 HTTP 대역 + 실제 Windows k6 | 4개 통과. 정상 종료·HTTP 오류·잘못된 JSON·p95 초과 중단 확인 |
| 임시 MariaDB + 실제 Spring + Linux k6 | JUnit 1개 통과, 계정 10개 순차 로그인·30회 조회 응답 모두 일치 |
| 기존 HTTP·이메일·WebSocket·관리 포트 E2E | 4개 통과 |
| Java 17 시험 번들·bootJar 빌드 | 성공 |
| 임시 자원 정리 | 시험 컨테이너·네트워크 없음, 기존 graduation-local-db 보존 |

신규 조회 시험의 원본: `build/isolated-e2e-results/memoryjar-e2e-c1d5b14ff78b/`.
기존 E2E 회귀 원본: `build/isolated-e2e-results/memoryjar-e2e-e8de306c3fa1/`.
조회 전후 검사 대상 업무 테이블 행 수 동일, 외부 SDK 대역 호출 0건을 확인했다.
조회 루프는 1 VU이며, 나머지 계정은 준비 단계의 로그인·내 정보·저금통 목록으로 확인했다.
로컬 오류 주입 시험은 오류·지연 중단 기능의 검사일 뿐 실제 서버 장애나 성능 결과가 아니다.

중간 실행에서 시험용 JDBC URL 비교가 드라이버의 기본 포트 생략을 허용하지 않아 실패했다.
기본 포트 생략만 정규화하고 다른 host·DB는 계속 거절하도록 보완했다.
또한 internal 네트워크의 호스트 포트 연결 방식은 사용하지 않고 격리 k6 컨테이너 방식으로 바꿨다.
실패한 중간 실행은 통과 결과에 포함하지 않았고 최종 코드로 다시 검증했다.
전체 백엔드 테스트를 이번에 전부 재실행한 것은 아니며 위 범위만 확인했다.

## 로컬 단계 완료 시점의 다음 단계

운영용 전용 시험 데이터 준비, 최신 백업, 시험 시간과 요청 간격·지속 시간 확정,
실제 EC2 대상 허용과 자원 감시기 연결을 별도로 검토한다.
그 후에만 10 VU를 실행하고, 결과와 종료 후 자원 회복을 확인한다.
후속 운영 데이터 준비·순차 확인은 위 EC2 준비 기록을 따른다. 실제 10 VU 측정은 아직 실행하지 않았다.
