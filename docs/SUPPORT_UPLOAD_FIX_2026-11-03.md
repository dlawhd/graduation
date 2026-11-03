# 비로그인 문의 이미지 첨부 실패 수정 — 2026-11-03

문의 본문은 정상 접수됐지만 이미지가 올라가지 않는 문제를 조사했다. 원인은 **운영 프록시의 요청 크기 제한과 새 S3 저장 경로의 권한 누락**이었다. 사용자가 두 설정의 운영 적용을 명시적으로 허용한 뒤 수정했다. 앱을 새로 배포하지 않고 운영 설정에 반영했다. 아래의 로컬 안내·진단 코드 변경은 별도이며 아직 커밋·푸시하지 않았다.

## 1. 수정한 파일과 위치

| 파일 | 역할 |
|---|---|
| `tools/deploy/nginx/support-attachments.conf` | 문의 첨부 URL만 요청 한도를 3MiB로 지정. 기존 프록시 헤더 유지 |
| `tools/deploy/support-upload-nginx.py` | 기본은 읽기 전용 계획. 해시 대조·백업·구문 검사·reload·실패 복구를 거쳐 명시 적용 |
| `tools/deploy/support-attachments-policy.template.json` | 현재 버킷 `support-attachments/*`에만 PutObject/GetObject/DeleteObject 허용하는 참고 정책 |
| `frontend/src/api/supportApi.js` | Nginx의 HTML 413 응답도 업로드 크기 제한으로 안내 |
| `src/main/java/shop/esjh/memoryjar/service/support/SupportAttachmentService.java` | 저장 실패 시 고정 오류 분류와 AWS 상태/허용된 오류 코드만 기록 |
| `src/test/java/shop/esjh/memoryjar/service/support/SupportExpansionIntegrationTest.java` | 게스트 첨부·동일 요청 재전송·타인 차단·저장 거부 후 재시도·로그 비밀값 제외 검사 |
| `src/test/java/shop/esjh/memoryjar/isolated/IsolatedHttpWebSocketTest.java` | 실제 비로그인 쿠키·CSRF·multipart PNG 전송 검사 추가 |
| `src/test/java/shop/esjh/memoryjar/isolated/IsolatedE2eLauncher.java` | 격리 HTTP/소켓 성공 기대 개수 4 → 5 반영 |
| `frontend/tests/support-preview.jsx`, `support-expansion.browser.cjs` | 비로그인 413/503 첨부 실패와 같은 문의에 재첨부하는 PC/모바일 회귀 검사 |
| `tools/deploy/test_support_upload_nginx.py` | 적용 범위·해시 불일치·중복 적용·실패 복구·정책 범위 검사 |

## 2. 기존 동작과 확인한 현상

문의는 본문을 먼저 접수하고 선택 이미지를 따로 저장한다. 첨부가 실패해도 본문은 남기고 같은 문의에서 재시도할 수 있도록 구현돼 있었다.

운영 로그의 최초 조사 집계에서 비로그인 문의 접수는 200이었고 첨부는 413이 10건, 503이 1건이었다. 사용자가 제공한 캡처에서도 약 341KB 파일의 첨부가 503이고 본문 접수가 완료된 상태였다. 쿠키·요청 헤더 원문·사진·문의 본문을 가져오지 않고 요청 종류별 상태만 확인했다.

- **413:** Nginx에 `client_max_body_size` 지정이 없었다. 기본 1MiB 제한이 앱에서 허용한 2MiB 이미지보다 먼저 작동했다. 실제 Nginx 오류 로그의 크기 초과 기록도 10건이었다. [Nginx 공식 설명](https://nginx.org/en/docs/http/ngx_http_core_module.html#client_max_body_size)
- **503:** 현재 API 역할로 새 첨부 경로에 70바이트 합성 PNG를 저장해도 S3가 403 `AccessDenied`를 반환했다. 파일 크기나 비로그인 쿠키가 원인은 아니었다. AWS 콘솔에서 기존 문의 정책이 `support-inquiries/*`만 허용하고 새 `support-attachments/*`는 빠진 것을 확인했다.

## 3. 변경한 동작

### 운영 Nginx

로그인 사용자·운영자·비로그인 문의의 `.../inquiries/{양의 번호}/attachments` 경로에만 `client_max_body_size 3m`을 추가했다. 2MiB 파일과 multipart 경계 정보가 통과할 여유를 둔 것이다. 앱의 파일당 2MiB·문의당 최대 3개·이미지 처리 동시 2개 제한은 유지한다.

현재 API 서버의 루트 프록시 앞에 관리되는 include를 한 번 추가했다. 기존 `/ws`, 일반 API의 위치와 전달 헤더는 보존했다. 원본 해시가 계획과 같을 때만 저장하고 `nginx -t`가 성공한 뒤 reload했다. 구문 검사나 reload가 실패하면 원본을 복구하도록 검증했다.

### 운영 IAM

현재 역할 `MemoryJarEc2RuntimeRole`에 인라인 정책 `MemoryJarSupportAttachmentsPolicy`를 추가했다.

| 권한 | 필요한 이유 |
|---|---|
| `s3:PutObject` | 첨부 이미지 저장 |
| `s3:GetObject` | 권한을 확인한 문의자·운영자의 이미지 열람 |
| `s3:DeleteObject` | 보관 기한이나 실패 상태에 따른 첨부 정리 |

리소스는 **현재 버킷의 `support-attachments/*`만**이다. 기존 두 정책은 보존했다. 버킷 공개 권한·목록 조회·버킷 정책 관리·IAM 관리 권한을 추가하지 않았다. 기존 문의 쿠키, 소유권, 운영자 허용 목록, CSRF, 짧은 미리보기 URL 검사도 그대로다.

### 로컬 코드

413이 HTML로 와도 연결 문제 대신 업로드 크기 제한으로 안내하도록 보완했다. S3 저장 실패 로그에는 `category=S3`, HTTP 상태, 허용한 오류 코드만 남긴다. AWS 오류 원문에는 버킷·객체 키·역할 정보가 섞일 수 있으므로 예외 메시지·스택·서명 URL은 기록하지 않는다. 이 보완은 향후 코드 배포에 포함할 항목이며 이번 운영 설정 적용과 구분한다.

## 4. 변경 이유와 영향 범위

브라우저가 파일을 허용한다고 해서 그 앞의 프록시나 외부 저장소도 자동으로 허용되지는 않는다. 앱의 정상적인 첨부 정책과 운영 설정을 맞췄다. 문의 전체를 다시 보내거나 이미 접수한 본문을 삭제하는 방식으로 처리하지 않았다.

첨부 저장 경로와 IAM 리소스를 함께 검토하지 못한 점, 1MB를 넘는 비로그인 multipart 전송을 기존 결합 검사에서 놓친 점을 이번 회귀 검사로 보완했다. 앞선 300명 시험은 일반 본문/대화 API 시험이었고 실제 운영 S3 업로드 용량을 검증한 결과가 아니었다.

## 5. 성능·보안·유지보수 효과

- 유효한 2MiB 이미지가 프록시 1MiB 제한 때문에 실패하는 불일치를 제거했다.
- 권한은 단일 첨부 경로의 세 가지 객체 작업에 한정했다. 앱의 회원/게스트 접근 경계도 유지했다.
- 기존 문의에 파일만 재시도하며 중복 본문과 중복 파일 저장을 방지한다.
- 변경 도구는 기본 읽기 전용이고 검토한 해시·백업·실패 복구를 사용한다.
- 실패를 사용자에게 설명할 수 있고, 로그에서 저장소 권한 문제를 개인정보 없이 구분할 수 있다.

## 6. 실행한 테스트·빌드

```powershell
./gradlew.bat test --tests '*SupportExpansionIntegrationTest' --tests '*SupportScreenshotValidatorTest' --console=plain
./tools/isolated/run-e2e.ps1
./gradlew.bat bootJar jar --console=plain

# frontend 폴더, TEST_BASE_URL과 기존 PLAYWRIGHT_MODULE 설정 후
node tests/support-expansion.browser.cjs
node --test src/**/*.test.mjs
node node_modules/vite/bin/vite.js build

# 기존 Python 런타임으로 운영을 변경하지 않는 단위 검사
python -B -m unittest discover -s tools/deploy -p test_support_upload_nginx.py -v
```

추가로 네트워크·호스트 포트가 없는 로컬 Nginx 컨테이너에서 실제 HTTP 본문을 전송했다. 문의 첨부 세 경로에서 2MiB+4KiB 요청 전달과 3MiB 초과 차단을 검사했다. 다른 경로 및 잘못된 번호의 기본 한도 유지도 검사했다. 외부 저장은 로컬 검사에서 대역이며, 운영 저장소 검사는 사용자 승인 후 개인정보 없는 1픽셀 파일로만 했다.

## 7. 검증 결과

| 구분 | 결과 |
|---|---|
| 백엔드 관련 DB/이미지 검사 | 36개 통과, 실패·제외 0 |
| 격리 실제 HTTP/소켓 | 5개 통과. 비로그인 1MiB 초과 PNG, CSRF 없음 403, 타인 게스트 404, 동일 요청 재전송 저장 1회 포함 |
| 문의 Chrome | PC 1,280px·모바일 390px의 18개 시나리오 통과 |
| 프론트 단위 검사 | 268개 통과 |
| Nginx 변경 도구/정책 단위 검사 | 8개 통과 |
| 로컬 실제 Nginx HTTP 검사 | 8개 통과. 임시 컨테이너·네트워크 모두 0개로 정리 |
| 백엔드 JAR·프론트 빌드 | 통과. 기존 Vite 대형 청크 안내는 남음 |
| 운영 Nginx | 구문 검사·reload 성공. 2MiB 봉투는 보안 필터의 403까지 도달, 3MiB 초과 413, 다른 경로 기본 제한 유지, FAQ 200 |
| 운영 S3 이전 | 70바이트 PNG의 PutObject가 403 AccessDenied. 파일 생성 안 됨 |
| 운영 S3 이후 | PutObject **200**, GetObject **200·바이트 일치**, DeleteObject **204** |
| 운영 버킷/IAM 관리 권한 | 기존 403 유지. 첨부 객체 작업 이외의 권한은 늘리지 않음 |

합성 요청의 403은 인증·CSRF를 넣지 않아 안전하게 차단된 결과이며, 실제 사용자의 이미지 저장 성공으로 세지 않는다. 운영의 전체 회원 수용량이나 성능 개선율을 새로 측정한 작업도 아니다.

운영 Nginx 파일은 `/etc/nginx/sites-available/default`, 새 include는 `/etc/nginx/snippets/memoryjar-support-attachments.conf`다. 원본 백업은 `/var/backups/memoryjar-support-uploads/20261103T054619-78c763472a55/`이며 이 파일명 시각은 서버 UTC다.

- 이전 설정 SHA-256: `78c763472a55a003c8de0fbfdfaf7bf2eab326b8bfbb8be31b9fc79f2f168d70`
- 적용 설정 SHA-256: `bd4627fcca1e04ea28399ba8c9ba3f9cf6c51c206b156f202524eb3f8d221be9`
- 첨부 snippet SHA-256: `a17fe09f3c0fdb0ffa57cc9f7d31ab13da49421bc76e10dc3fec6bb29f7b6c89`

로컬 실행 로그·합성 프록시 검사·민감정보 없는 S3 상태 집계·IAM 적용 화면은 `build/support-upload-fix-2026-11-03/`에 보관한다. 실제 사용자 사진이나 자격 증명은 저장소에 복사하지 않았다.

## 8. 사용자 확인과 남은 적용 사항

운영 설정 적용 후 사용자가 문의 이미지가 정상적으로 접수되고 운영자 화면에도 보인다고 확인했다. 이는 실제 사진에 대한 사용자 확인 결과이며, 위의 합성 이미지 진단 결과와 구분한다.

첨부 오류 안내/진단 코드와 회귀 검사를 함께 보관한다. 운영 설정을 수정하던 단계에서는 API 이미지를 교체하거나 DB를 변경하지 않았다. 저장 권한과 크기 제한은 승인받은 Nginx·IAM 설정에 직접 반영해 해결했고, 그 설정 해결 자체에는 앱 재배포가 필요하지 않았다.
