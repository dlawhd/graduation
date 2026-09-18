## 1. 설정 목적

Memory Jar의 AI Draft 원본 이미지를 안전하게 처리하기 위해 AWS를 연결했다.

사용자가 Canvas에서 그린 PNG를 업로드하면 백엔드는 다음 순서로 처리한다.

```
사용자 브라우저
  → Vercel 프론트엔드
  → EC2의 Spring Boot API
  → AWS Rekognition 이미지 심사
  → Private S3 원본 저장
  → MariaDB에 Draft 정보 저장
```

핵심 목표는 AWS Access Key를 서버 파일에 직접 보관하지 않고, EC2 IAM 역할로 AWS 권한을 안전하게 사용하는 것이다.

---

## 2. 현재 운영 환경

| 항목 | 값 |
| --- | --- |
| AWS 리전 | `ap-northeast-2` (서울) |
| EC2 | `graduation-backend` |
| 백엔드 컨테이너 | `spring-api` |
| DB 컨테이너 | `mariadb` |
| S3 버킷 | `esjh-files` |
| EC2 IAM 역할 | `MemoryJarEc2RuntimeRole` |
| IAM 정책 | `MemoryJarAiDraftRuntimePolicy` |
| 배포 방식 | GitHub Actions → GHCR → EC2 self-hosted runner |
| 프론트엔드 | Vercel |
| 백엔드 주소 | `https://api.esjh.shop` |

---

## 3. IAM 역할이 필요한 이유

처음에는 Docker 컨테이너 환경변수에 아래처럼 AWS 장기 키가 들어 있었다.

```
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
```

이 방식은 서버 설정 파일이나 백업이 노출되면 장기 AWS 키도 유출될 위험이 있다.

현재는 EC2에 IAM 역할을 연결했다.

```
Spring API 컨테이너
  → EC2 Instance Metadata Service(IMDSv2)
  → MemoryJarEc2RuntimeRole
  → AWS 임시 자격증명 발급
  → S3 / Rekognition / SES 사용
```

AWS가 임시 자격증명을 자동 갱신하므로, 애플리케이션 코드나 Docker Compose 파일에 AWS Access Key를 넣을 필요가 없다.

---

## 4. 생성한 IAM 역할과 정책

### IAM 역할

```
역할 이름: MemoryJarEc2RuntimeRole
신뢰 대상: EC2 서비스
```

이 역할은 EC2 인스턴스에 연결했다.

### 정책이 허용하는 기능

| AWS 서비스 | 권한 | 사용 목적 |
| --- | --- | --- |
| S3 | `GetObject`, `PutObject` | 기존 파일 조회·업로드, Draft 원본 저장 |
| S3 | `DeleteObject` | Draft DB 저장 실패 시 업로드된 원본 보상 삭제 |
| Rekognition | `DetectModerationLabels` | Draft 원본 이미지 유해성 심사 |
| SES / SES v2 | `SendEmail` | 회원 이메일 인증·비밀번호 재설정 메일 발송 |

S3 권한은 전체 버킷이 아니라 필요한 경로 중심으로 제한했다.

```
notes/*
profiles/*
jars/*
jar-design-drafts/originals/*
```

특히 `DeleteObject`는 Draft 원본 경로에만 허용했다.

---

## 5. IMDSv2 설정

EC2의 인스턴스 메타데이터 옵션을 다음처럼 설정했다.

| 설정 | 값 |
| --- | --- |
| 인스턴스 메타데이터 서비스 | 활성화 |
| IMDSv2 | 필수 |
| HTTP PUT 응답 홉 제한 | `2` |

Docker 컨테이너에서 EC2 메타데이터에 접근하려면 hop limit이 최소 `2`여야 한다.

검증 결과:

```
ROLE=MemoryJarEc2RuntimeRole
IMDSV2_ROLE_CREDENTIALS=AVAILABLE
```

즉 `spring-api` 컨테이너가 EC2 역할의 임시 자격증명을 실제로 받아올 수 있다.

---

## 6. Docker Compose 변경

배포 서버의 Compose 파일 위치:

```
/home/ubuntu/deploy/docker-compose.prod.yml
```

기존의 아래 환경변수는 제거했다.

```
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
```

반대로 아래 값은 AWS 인증정보가 아니라 설정값이므로 유지했다.

```
APP_S3_REGION=ap-northeast-2
APP_S3_BUCKET=esjh-files
APP_SES_REGION=...
APP_SES_FROM_EMAIL=...
```

변경 후 `spring-api` 컨테이너에서 확인한 결과:

```
AWS_ACCESS_KEY_ID=NOT_SET
AWS_SECRET_ACCESS_KEY=NOT_SET
AWS_SESSION_TOKEN=NOT_SET
AWS_PROFILE=NOT_SET
```

정적 키가 없는 상태에서도 IAM 역할 임시 자격증명을 정상적으로 사용한다.

---

## 7. Rekognition이 담당하는 일

Rekognition은 AI 이미지를 생성하는 서비스가 아니다.

현재 Rekognition은 사용자가 업로드한 Draft 원본 PNG가 정책상 허용되는 이미지인지 확인하는 **동기 심사** 용도다.

```
사용자 PNG 업로드
  → 실제 PNG / 480×480 / 최대 10MB 검증
  → Rekognition DetectModerationLabels 호출
  → 허용: Private S3 저장 + Draft 생성
  → 유해성 감지: 업로드 차단
  → AWS 장애·권한 오류: 안전하게 업로드 차단
```

AWS 심사 결과를 받지 못한 상태에서 이미지를 저장하지 않도록, 장애 상황도 차단하는 정책으로 구현했다.

---

## 8. 실제 운영 검증 결과

### 기존 기능

IAM 역할 전환 후 운영 웹에서 다음을 확인했다.

- 기존 파일 업로드 성공
- 업로드한 파일 조회 성공
- 이메일 발송 성공

즉 기존 S3·SES 기능이 정적 키 없이 IAM 역할로 정상 동작한다.

### AI Draft 업로드

운영 배포 후 실제 480×480 PNG를 업로드해 확인했다.

```
POST /api/v1/design-drafts
응답: HTTP 201 Created
Draft ID: 1
만료 시각: 7일 후
```

이 요청은 실제로 아래 전체 흐름을 통과했다.

```
로그인 쿠키 인증
  → CSRF 검증
  → PNG 검증
  → Rekognition 심사
  → Private S3 업로드
  → 운영 MariaDB Draft 저장
```

---

## 9. 배포 흐름

```
main 브랜치 push
  → GitHub Actions 테스트
  → Docker 이미지 빌드
  → GHCR에 latest 이미지 push
  → deploy 워크플로 실행
  → EC2 self-hosted runner
  → docker compose pull
  → docker compose up -d
```

운영 배포 시 Flyway V32도 자동 적용됐다.

```
Successfully applied 1 migration
now at version v32
```

---

## 10. 보안 주의사항

- AWS Access Key, Secret Key, 개인키, 토큰은 코드·Git·Notion·채팅에 기록하지 않는다.
- Docker Compose에 정적 AWS 키를 다시 추가하지 않는다.
- AWS 권한은 IAM 역할 정책에서만 관리한다.
- 이메일 인증 HMAC Secret은 노출 가능성이 있으면 즉시 교체한다.
- 기존 IAM 사용자 Access Key는 며칠간 운영 상태를 관찰한 뒤 비활성화하고 삭제한다.
- S3 버킷은 Public Access Block과 기본 암호화 설정을 유지한다.

---

## 11. 추후 AWS 운영 작업

필수 기능은 완료됐지만, 아래 작업은 운영 안정성을 위해 추후 진행한다.

1. S3 Lifecycle 규칙 설정
    - `jar-design-drafts/originals/`의 만료 Draft 원본 자동 정리
    - 기존 `notes/`, `profiles/`, `jars/`에는 삭제 규칙을 섞지 않는다.
2. IAM 사용자 장기 Access Key 폐기
    - 다른 서버·CI에서 사용하지 않는지 확인
    - 비활성화 후 이상 없으면 삭제
3. CloudWatch 모니터링
    - S3/Rekognition/SES 권한 오류
    - 백엔드 5xx 오류
    - 컨테이너 기동 실패등을 빠르게 확인할 알림 구성