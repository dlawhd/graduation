# API 배포 검증·보호·원복

## 변경 전과 목적

기존 배포는 가변 `latest`를 사용해 전체 Compose를 적용하고 이전 이미지를 prune했다.
이 방식은 시험용 DB 캐시/진단 설정을 원복하거나 DB까지 교체할 수 있고, 실패 시 자동 상태 검사·원복이 없었다.
이번 변경은 API 배포를 대상으로 하며 DB·캐시의 영구 변경, 무중단 배포, 성능 개선을 의미하지 않는다.

## 파일별 책임

| 경로 | 역할 |
| --- | --- |
| `.github/workflows/publish-ghcr.yml` | 백엔드/배포 도구 검사 후 이미지 SHA 태그·revision 라벨·실제 digest manifest 생성 |
| `.github/workflows/deploy.yml` | 같은 성공한 main 실행의 소스/manifest만 내려받아 배포, 실행 중 강제 취소 방지 |
| `tools/deploy/image-manifest.py` | 저장소·40자리 SHA·digest 형식 검증, 비밀값 없는 manifest 생성 |
| `tools/deploy/deploy-api.py` | 최신 SHA·설정·이미지 검증, API만 교체, 준비 상태 검사, 실패 시 조건부 원복 |
| `tools/deploy/test_deploy.py` | 실제 운영 없이 명령 대역으로 실패·원복·비밀값 비노출 검사 |
| `tools/monitoring/deploy-workflow.test.mjs` | workflow의 소스/run artifact 연결과 배포 경로 우회 방지 검사 |
| `tools/monitoring/diagnostics.override.example.yml` | 이미지/DB 설정 없이 진단 플래그 하나만 추가하는 서버 파일 예시 |

## 성공 조건과 보호 범위

1. Publish 실행이 성공하고 같은 저장소 main이어야 한다. Checkout은 해당 실행의 head SHA,
   artifact는 해당 실행 ID/커밋 이름으로 연결한다.
2. 배포 실행기는 manifest SHA/저장소/digest를 검증하고 main 최신 SHA를 pull 전과 교체 직전에 확인한다.
   `latest`는 호환용 태그로 남지만 배포 대상으로 사용하지 않는다.
3. workflow concurrency는 실행 중 강제 취소를 하지 않는다. 서버에서도 OS 파일 잠금으로 중복 실행을 막는다.
4. 원본 Compose와 실행 중 API 환경을 대조한다. 고정 경로의 진단 파일은 플래그 하나 이외의
   DB/이미지/포트/볼륨 변경을 거절한다. 파일/DB 상태가 도중에 바뀌면 더 진행하지 않는다.
5. 디스크 1GiB 이상, 기존 API/DB 실행 상태·내부 health를 확인하고 원복할 이전 이미지 ID를 보존한다.
   디스크 기준은 모든 이미지 크기에 대한 충분조건이 아니며 pull 실패는 교체 전에 중단된다.
6. digest pull 후 이미지 revision 라벨을 커밋과 비교한다. API에만 `--no-deps --pull never`로 적용한다.
7. 실제 실행 이미지/revision, 재시작·OOM, 기존 포트·볼륨, DB ID/기동 시각/캐시 유지,
   내부 health·Heap/풀 계측·진단 플래그, 일반 포트 관리 접근 403, 익명 CSRF 응답을 확인한다.
   익명 CSRF 검사는 로그인 부하나 실제 사용자 세션을 만들지 않는다.

## 실패와 원복

- pull/입력/최신 SHA 검사 실패는 API 교체 전에 중단한다.
- 교체 후 검증에 실패하면 **이 실행이 교체한 새 이미지**인지, DB/원본 설정이 유지됐는지 확인한다.
  조건이 맞을 때만 기존 로컬 이미지 ID로 API를 다시 구성하고 동일한 준비 상태 검사를 한다.
- 제3자가 교체한 API/DB/설정은 덮어쓰지 않는다. 원복 실패·대상 불일치는 `manualRecoveryRequired`로 보고한다.
  실패한 배포는 원복에 성공해도 CI 성공으로 바꾸지 않는다.
- `/home/ubuntu/deploy/api-deploy-<sha>-<random>/`에 baseline·target/rollback override·결과를 남긴다.
  기록에는 환경변수·SQL·토큰·CSRF 값·외부 예외 원문을 넣지 않는다.
- 이전 이미지의 자동 prune을 제거했다. 이미지/기록 정리는 별도로 대상과 디스크 여유를 확인하고 승인받는다.

## 제한과 운영 확인

- API 재생성 중 짧은 요청 실패·WebSocket 단절은 가능하다. 강제 종료/호스트 장애/전원 단절까지
  자동 원복을 보장하지 않는다. OS 잠금은 프로세스 종료 시 해제되지만 결과와 실제 기동 상태를 재확인해야 한다.
- DB 캐시 시험 override는 API 전용 배포에서 유지될 뿐 영구 반영된 것이 아니다.
  나중에 전체 Compose를 적용하면 달라질 수 있다. 진단은 서버 선택 파일을 제거하고 API를 재구성하면 꺼진다.
  위 설명은 최초 배포 도구 구현 시점의 상태다. 이후 2026-10-18 기본 DB 명령 보존은
  [DB 메모리 기준 설정](DB_MEMORY_BASELINE.md)에 별도로 기록했다. 자동 배포는 여전히 DB를 재생성하지 않는다.
- 파괴적인 DB 변경·마이그레이션 원복·사용자 데이터 복구는 이 실행기의 범위가 아니다.
- 익명 CSRF와 health가 정상이어도 로그인/CSRF 전체 흐름, 유휴 후 지연, 300 VU를 통과한 것은 아니다.
- 2026-10-18: 배포 도구 15개 검사 로컬/EC2 Linux 통과, workflow 연결 검사 2개 통과.
  EC2 사전 검사와 이전 이미지 override 해석 통과. 이 기록 시점에는 새 파이프라인의 실제 배포는 아직 실행 전이다.

Artifact 연동은 [GitHub 공식 download-artifact 설명](https://github.com/actions/download-artifact)의
run-id와 actions:read 토큰 방식을 사용한다.
