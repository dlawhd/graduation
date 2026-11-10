# 8개 보안 항목 보완 — 2026-11-08 착수 / 11-09 최종 검증

> 후속 작업: 2026-11-10 실제 운영 버킷에서 공개 읽기를 확인하고 경로별 차단을 적용했다. 아래의 ‘운영 미적용’은 11-09 검증 당시의 기록이다. 현재 운영 상태·추가 인증·자동화의 반영 범위는 [후속 보안 작업 기록](OPERATOR_SECURITY_2026-11-10.md)을 확인한다.

기준 프로젝트는 `C:/Users/whdgu/Desktop/graduation`, 기준 커밋은 `ad04f33e09f52c9c3275526dca7ee2bbe71afe8f`이다. 소스 수정과 로컬 시험 범위이며 운영 설정·DB·버킷 정책은 적용하지 않았다.

## 무엇을 바꾸었나?

| 항목 | 이전 문제 | 변경한 규칙 |
| --- | --- | --- |
| 댓글 비공개 | 번호로 다른 멤버의 비공개 쪽지에 접근 가능 | 조회·페이지·작성·수정·삭제 모두 오픈 전에는 본인 쪽지만 허용. 다른 쪽지는 없는 쪽지와 동일한 404. 비공개 댓글의 알림과 공통 WebSocket 이벤트 차단 |
| 로그인·메일 | 발송 전체 한도와 로그인 제한 부족 | 계정·IP·전체 요청 예산을 따로 확보. 비밀번호 검증은 서버당 최대 2개 동시 실행 |
| 원본 사진 | 동시 이미지 처리 제한 없음 | 바이트 읽기·디코딩 전에 최대 2개 처리 슬롯 확보. 초과는 대기열을 키우지 않고 429 |
| 보안 패치 | 이전 Tomcat의 알려진 WebSocket 취약점 | Boot 3.5.16, 같은 10.1 계열 Tomcat 10.1.61로 갱신 |
| 첨부 읽기 | 만료 없는 저장소 주소 전달 | 현재 멤버·공개 여부 확인 후 60초 읽기 주소 발급. 업로드 주소로도 연결된 쪽지의 권한 검사를 우회할 수 없음 |
| 파일 내용 | 크기·Content-Type만 확인 | S3 버전을 고정해 실제 이미지 디코딩 또는 영상 컨테이너·영상 스트림을 확인한 뒤 같은 버전만 확정 |
| 업로드 한도 | 무제한 발급·누적 보관 가능 | 사용자 잠금 안에서 발급 수·대기 파일·보관량 검사. 7일 미사용 완료 파일 정리를 NOTE·PROFILE·JAR에 적용 |
| 문의 상태 | 해결·재문의를 번갈아 알림 생성 | 사용자·게스트당 시간당 20회 상태 변경. 운영자는 1,000회. 동일 상태 재시도는 횟수·감사 기록·알림을 추가하지 않음 |

숫자는 남용을 막는 기본 정책이다. **300명의 모든 요청이 성공한다는 처리 용량 보장은 아니다.** 초과는 429로 안내하며 서비스 부하는 별도 측정이 필요하다.

## 댓글과 첨부의 비공개 규칙

로그인과 현재 멤버 여부를 확인하고, 오픈 전에는 본인이 작성한 쪽지만 읽는다. 다른 사람의 비공개 쪽지는 본문·댓글·첨부 모두 404다. 비공개 댓글을 저장해도 다른 멤버에게 댓글 알림·공통 이벤트를 보내지 않는다.

댓글·파일 읽기·이벤트 발행에서는 이미 커밋된 오픈 기록만 읽는다. 권한 검사 중 새 오픈 트랜잭션을 시작하지 않는다. 기존 저금통·쪽지 상세 조회의 보정 오픈과 자동 오픈 기능은 유지한다.

- `GET /api/v1/files/attachments/{id}/content`: 쪽지 첨부 읽기.
- `GET /api/v1/files/uploads/{id}/content`: 완료 업로드 미리보기. 미연결 파일은 업로더만, 연결된 파일은 쪽지와 같은 권한 검사. 과거 COMPLETED 기록과 삭제 표시된 첨부도 미연결 파일로 오인하지 않는다.
- 응답: `302`, `Cache-Control: no-store`. S3가 영상 Range(필요한 일부 바이트만 읽는 요청)도 처리하므로 API가 영상 전체를 대신 전송하지 않는다.
- `Sec-Fetch-Site: cross-site` 요청은 차단해 다른 사이트의 이미지 삽입으로 존재 여부를 검사하지 못하게 한다. 기존 운영의 `www.esjh.shop`/`api.esjh.shop`과 로컬의 같은 호스트·다른 포트 구성을 지원한다. 서로 다른 사이트의 프리뷰 배포는 별도 출처 설계가 필요하다.

발급한 S3 주소는 최대 60초 유효하다. 로그아웃·강퇴 직후 이미 발급한 주소를 즉시 폐기하거나 내려받은 사진을 회수한다는 뜻은 아니다.

DTO 필드는 유지한다. `url`은 보호된 API 경로이며, 고정 썸네일 주소를 다시 노출하지 않도록 `thumbnailUrl`은 null이다. 현재 일반 첨부 흐름에는 실제 썸네일 생성이 없다. 프론트 공통 변환기는 쪽지·오늘의 추억·업로드 응답의 보호 경로만 API 서버 주소로 바꾼다. 기존 외부 주소와 blob 미리보기는 유지한다. 원본 바이트·설명·정렬·영상·사진 확대 탐색을 변경하지 않는다.

‘내가 넣은 쪽지’의 별도 API에도 같은 변환을 적용한다. `img`·`video`의 직접 요청은 Axios의 로그인 갱신을 거치지 않으므로, 보호된 주소가 실패하면 기존 `/api/v1/me` 요청으로 세션을 확인한 뒤 한 번만 다시 읽는다. 동시 실패는 한 번의 세션 확인으로 합친다. 계속 실패하면 기존 오류 화면을 사용하고, 주소 변경·화면 이탈 후 늦은 결과는 무시한다. 공개 주소·blob에는 이 재시도를 적용하지 않는다. 정상 로딩에는 추가 세션 확인 요청이 없다. 사진 확대에 사용하는 DOM 참조와 영상의 재생 위치도 보존한다.

## 요청 제한

| 설정 (`app.security.*`) | 기본값 |
| --- | --- |
| `login-account-per-15-minutes` | 계정당 15분에 10회 |
| `login-ip-per-minute` | IP당 1분에 60회 |
| `login-global-per-minute` | 전체 1분에 300회 |
| `email-address-per-hour` | 이메일당 1시간에 5회, 목적 간 공유 |
| `email-ip-per-hour` | IP당 1시간에 30회 |
| `email-global-per-hour` | 전체 1시간에 300회 |
| `trusted-proxy-addresses` | `127.0.0.1,::1` |

로그인은 실패뿐 아니라 시도 전체를 센다. 기존 인증번호의 60초 재발급·5회 오입력 제한도 유지한다. 새 제한 테이블에는 이메일·IP 원문 대신 기존 비밀 설정을 이용한 용도별 HMAC(비밀값으로 만드는 식별용 지문)을 저장한다. 인증·메일 처리 전에 별도 짧은 트랜잭션으로 횟수를 확정해 업무 실패로 횟수가 되돌아가지 않는다. 여러 예산의 잠금 순서를 고정하고 최초 생성에도 배타 잠금을 확보하는 기존 문의 제한의 upsert 방식을 재사용한다. 오래된 카운터는 최대 500개씩 정리한다.

지원하는 제한 시간은 최대 1시간이며, 2시간 이상 사용되지 않은 기록을 매분 최대 4배치로 정리한다. 기본 요청 한도에서 새 식별자가 생기는 속도보다 빠른 정리량으로 잡았다. 파일 저장소 장애가 정리를 멈추지 않도록 별도 스케줄러를 사용한다. 운영자가 요청 한도를 크게 올린다면 정리 처리량도 함께 검토해야 한다.

**프록시:** 인터넷에서 직접 온 `X-Forwarded-For`는 신뢰하지 않는다. 등록한 프록시에서만 헤더를 읽고 가까운 쪽부터 처음 만나는 신뢰하지 않는 주소를 사용한다. Docker에서 Nginx가 다른 주소로 보이면 그 실제 주소만 `APP_SECURITY_TRUSTED_PROXY_ADDRESSES`에 등록해야 한다. 미설정이면 프록시 사용자들이 한 IP 한도를 공유할 수 있다. 전체 사설망이나 `0.0.0.0/0`를 등록하지 않는다. 기존 전달 헤더 처리도 반영 전에 대조한다.

## 파일 검사와 업로드 한도

- 사진: JPEG·PNG·WebP·GIF의 실제 형식과 선언한 형식을 대조. 한 변 8,192, 총 16,777,216픽셀 이하. 최대 2,048 크기로 샘플링해 디코딩하되 저장하는 원본 바이트는 바꾸지 않는다. GIF는 첫 프레임 검사이며 모든 프레임 분석은 아니다.
- 영상: MP4·QuickTime·WebM의 컨테이너와 실제 영상 스트림을 ffprobe(영상 구조를 읽는 도구)로 검사. 오디오 전용·형식 위장·깨진 헤더는 거절한다. 모든 프레임의 완전 디코딩이나 악성코드 전수 검사를 뜻하지 않는다.
- 셸·사용자 URL 없이 고정 인수로 실행. 외부 네트워크 프로토콜과 HLS/재생목록 형식 차단. 분석량·메모리 할당·5초 실행 시간 제한. 임시 파일은 정리하고 검사기가 없으면 503으로 거절한다.
- 일반 첨부 검사도 서버당 최대 2개 동시 처리. S3 읽기·복사·삭제는 DB 트랜잭션 밖에서 실행한다.
- 실패 파일은 최종 위치로 복사하지 않는다. `.pending`은 기존 서명 만료 뒤 정리 작업으로 제거한다. 완료 영수증 재시도는 유지하며 과거 완료 파일을 소급해 검사한 것은 아니다.
- NOTE는 기존 사진·영상, PROFILE·JAR는 사진만 허용한다.

| 설정 (`app.file.*`) | 기본값 |
| --- | --- |
| `max-uploads-per-hour` | 계정당 시간당 60개 발급 |
| `max-pending-uploads` | 계정당 대기 파일 20개 |
| `max-account-bytes` | 계정당 1GiB(1,073,741,824바이트) |
| `ffprobe-executable` | `ffprobe` |

동일 계정의 사용자 행을 잠근 뒤 합계를 확인하고 발급 기록을 저장한다. 실제 읽기도 예약한 크기까지만 허용한다. 사용 중·삭제 재시도 파일도 실제 삭제 전까지 용량에 포함한다. 실패·만료된 발급도 시간당 횟수에는 포함한다.

서명 준비는 인증정보 갱신 때문에 네트워크를 사용할 수 있어 DB 트랜잭션 밖에서 실행한다. 계정 한도 검사와 예약 저장만 별도 짧은 트랜잭션에서 처리한다. 준비한 티켓 중 실제 예약에 성공한 것만 사용자에게 반환한다. DB 번호로 보호 경로를 확정해 기존 URL 컬럼에도 유효한 보호 주소를 저장한다.

계정 용량은 업로드 기록에 따른 예약·보관량이다. 상태가 만료됐더라도 임시 파일 삭제가 확인되지 않았다면 용량을 계속 예약한다. S3 삭제 실패를 이용해 예약 용량을 즉시 되돌리는 것을 막는다. 이는 버킷 전체의 실제 청구 용량을 집계하는 기능은 아니다.

미사용 정리는 7일 지난 완료 파일만 최대 50개씩 수행한다. 삭제 예약과 쪽지 연결의 기존 원자적 상태 전환을 유지한다. 쪽지 첨부(삭제 표시 포함), 최종 디자인, 제작 중 원본·테두리, AI 결과·후보에 참조가 있으면 지우지 않는다.

### 영상 검사기 준비

Docker 런타임은 이미지 생성 시 패키지 관리자로 ffmpeg를 설치해 ffprobe를 제공한다. 실제 영상 변환은 하지 않는다. IDE에서는 PATH에 설치하거나 프로그램 인수 `--app.file.ffprobe-executable=<실행 파일의 전체 경로>`를 지정한다.

이번 시험은 공식 FFmpeg 다운로드 페이지가 안내하는 Windows 배포본을 `build/security-tools/`에만 받아 제공된 SHA-256과 대조했다. 시스템 설치·운영 변경·바이너리 Git 추가는 하지 않았다. 시험 경로는 `clean`으로 삭제될 수 있다. 시험 영상은 16×16 단색 한 프레임과 짧은 합성음이며 사용자 사진·음성은 없다. 실제 영상 검사 테스트는 검사기 없는 PC에서 설치 필요 사유로 건너뛰지만, 부재 시 503을 반환하는 테스트는 항상 실행한다.

이번 PC에서 IDE로 실행할 때는 기존 프로그램 인수에 다음을 추가할 수 있다.

```text
--app.file.ffprobe-executable=C:/Users/whdgu/Desktop/graduation/build/security-tools/ffprobe.exe
```

## 운영 반영 전 확인

1. **저장소 정책 확인이 남았다.** 새 읽기 권한 검사는 예전에 공개한 저장소 주소를 폐기하지 않는다. 버킷·객체 ACL·CDN의 공개 허용이 남으면 우회 경로도 남는다.
2. [정책 템플릿](../tools/security/private-attachment-policy.template.json)은 아직 적용하지 않았다. 버킷·계정·실행 역할·허용 운영 역할을 채운 뒤 기존 정책에 **문장을 병합**해야 한다. 이 파일로 기존 정책 전체를 교체하면 안 된다. 공개 차단 설정·역할 읽기 권한·CDN/OAC 사용도 함께 확인한다.
3. 템플릿은 `notes/*`, `profiles/*`, `jars/*`의 승인하지 않은 읽기를 명시적으로 거절한다. AI 전용 경로와 다른 저장 경로는 바꾸지 않는다.
4. 프론트가 새 보호 경로를 해석하도록 먼저 반영하고 백엔드·V59·V60을 반영한다. 예전 탭은 새로고침이 필요할 수 있다. 공개 경로 차단은 새 경로의 사진·영상 재생 확인 후 진행한다.
5. 별도 공개 CDN이 캐시했다면 그 경로도 차단·무효화해야 한다. 60초 서명 만료와 공개 파일 캐시 무효화는 다른 작업이다.
6. 프록시 IP·ffprobe·기존 계정의 보관량을 확인한다. 로컬 시험은 운영 설정 확인이나 실제 공격 재현을 대신하지 않는다.

정책 템플릿의 Deny 예외는 권한 부여가 아니다. 실행 역할에 해당 파일 경로의 `s3:GetObject` 권한이 별도로 있어야 한다. **운영 버킷의 공개 정책·ACL·CDN 확인과 적용 전에는 5번 위험의 운영 해결을 완료했다고 말할 수 없다.**

## 주요 수정 파일과 영향

| 범위 | 파일 |
| --- | --- |
| 로그인·메일 | `controller/AuthController.java`, `security/AuthRequestLimits.java`, `RequestBudgetService.java`, `TrustedClientAddress.java`, `entity/SecurityRequestLimit.java`, `repository/SecurityRequestLimitRepository.java` |
| 댓글 비공개·알림 | `service/note/NoteCommentService.java`, `NoteRealtimeService.java` |
| 원본 처리 수 제한 | `security/BoundedWorkGate.java`, `service/ai/JarDesignDraftUploadService.java` |
| 업로드·검사·정리 | `service/file/FileService.java`, `FileUploadReservationService.java`, `FileUploadPolicy.java`, `UploadedMediaValidator.java`, `FileUploadTransactionService.java`, `FileUnusedCleanupPersistenceService.java`, `FileUnusedCleanupScheduler.java`, 파일 Entity·Repository·설정 |
| 첨부 권한·주소 | `controller/file/FileContentController.java`, `service/file/FileReadAccessService.java`, `PrivateFileLinkService.java`, `dto/note/response/NoteAttachmentResponse.java`, `service/note/NoteService.java`, `service/jar/JarDailyDrawService.java` |
| 문의 상태 제한 | `service/support/SupportConversationService.java` |
| 프론트 | `frontend/src/api/privateMedia.mjs`, `privateMediaSession.js`, 쪽지·내 쪽지·파일·추억 API 모듈, `frontend/src/components/PrivateMedia.jsx`, 첨부 미리보기·캐러셀·두 원본 확대 창 |
| DB·실행 | `V59__security_request_budgets.sql`, `V60__upload_quota_and_unused_cleanup.sql`, `SchedulerConfig.java`, `build.gradle.kts`, `Dockerfile` |

위 Java 경로는 `src/main/java/shop/esjh/memoryjar/` 기준이며 Migration은 `src/main/resources/db/migration/`에 있다. 기존 적용 Migration은 수정하지 않았다.

보안과 동시성 검사를 추가하는 대신 일부 DB 조회와 파일 내용 읽기 비용은 늘어난다. 사진·영상·비밀번호의 동시 작업 수를 제한하고, 외부 I/O 중에는 DB 잠금을 점유하지 않는 방식으로 자원 사용을 제어한다. 실제 지연 시간이나 300명 수용량의 개선율을 이번 작업에서 측정한 것은 아니다.

## 검증 결과

2026-11-09 실제 실행 결과다.

| 실행 | 결과 |
| --- | --- |
| 백엔드 전체 `gradlew test bootJar` | 2,213건 중 **2,205 통과·실패 0·조건부 제외 8** |
| 이후 최종 댓글·이벤트·첨부 접근·예약 주소·용량·파일 정리 보완의 관련 테스트 재실행 | 모두 통과, JAR 재생성 성공 |
| 마지막 실제 미디어·업로드 변경 방지·검사 실패 전파 검사 | **18 통과·실패 0·제외 0**. 잘못된 내용은 최종 복사·완료 저장으로 넘어가지 않음 |
| 프론트 전체 `node --test` | **323 통과·실패 0** |
| 실제 Chrome 검사 | **2 통과**: 기본 이미지·영상 Range·쿠키 분리, 실제 React의 만료 후 복구·이미지 참조·실패 재시도 종료 |
| Vite 배포 빌드 | 성공. 기존 큰 chunk 경고는 남아 있음 |
| Docker 런타임 단계 | 시험 이미지 빌드 성공. 네트워크를 끈 컨테이너에서 ffprobe의 실제 MP4 스트림 판독 성공 |
| JAR 내용 검사 | Boot 3.5.16, Tomcat core·websocket·el 모두 10.1.61 포함. `application-local*` 미포함 |
| `git diff --check` | 공백 오류 없음 |

전체 회귀와 최종 관련 재실행은 일부 겹치므로 숫자를 더하지 않는다. 최종 재실행에는 전체 검사 이후 추가한 ‘만료됐지만 삭제가 확인되지 않은 파일의 용량 예약’ 시험도 포함한다.

실제 MariaDB에서 제한 카운터 최초 생성 경합, 서로 다른 계정·IP·이메일의 한도, 업무 롤백 뒤 횟수 유지, 동일 계정의 발급 경합, 미사용 삭제·첨부 연결 경합, 강퇴·삭제·과거 완료 기록의 접근 차단을 확인했다. 실제 이미지 디코더로 JPEG·PNG·GIF·WebP를 확인했고 Windows ffprobe로 정상 파일·위장·오디오 전용·깨진 파일도 검사했다.

Chrome 검사는 운영 계정이 없는 별도 프로필과 로컬 API/S3 대역을 사용한다. 실제 React 코드와 쿠키·302·Range 동작을 시험했지만 운영 로그인·IAM 설정의 검증은 아니다. Docker 검사는 동일 런타임 구성과 검사기 실행에 대한 시험이며 운영 애플리케이션 전체 기동을 뜻하지 않는다.

제외된 8건은 별도 Docker 환경을 요구하는 실제 HTTP/STOMP 6건, 읽기 시나리오 1건, 300명 문의 시나리오 1건이다. **이번 작업에서 300명 부하 시험을 다시 통과했다고 주장하지 않는다.** 실제 메일·유료 AI·운영 DB·운영 S3·운영 배포는 실행하지 않았다. 위 결과는 커밋·푸시 전 로컬 검증 기록이다.

공식 근거: [Tomcat 보안 공지](https://tomcat.apache.org/security-10), [Spring Boot 3.5 안내](https://docs.spring.io/spring-boot/3.5/gradle-plugin/getting-started.html), [ffprobe 문서](https://ffmpeg.org/ffprobe.html).
