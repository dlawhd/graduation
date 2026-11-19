# 보관함·초안 로컬 UI 검증

운영 API·DB·S3를 사용하지 않는 가짜 API 서버다. 저장소 루트의 PowerShell에서:

```powershell
$env:VITE_API_BASE_URL='http://127.0.0.1:18962'
$env:VITE_WS_BASE_URL='ws://127.0.0.1:18962/ws'
npm.cmd --prefix frontend run build -- --outDir ../build/selected-features/frontend
Remove-Item Env:VITE_API_BASE_URL
Remove-Item Env:VITE_WS_BASE_URL
python tools/ui/selected-features-fixture.py
```

- `http://127.0.0.1:18962/jars`: 12개 시험 저금통에서 현재 페이지 밖 검색, 열린/잠긴/즐겨찾기 필터와 별 버튼을 확인한다.
- `/jars/new`: 본인 초안 목록 → 이어서 만들기 → 이름·인원·날짜 입력 후 새로고침 복구를 확인한다.
- `/jars/900001`: 버튼 배치·캘린더 파일·쪽지 초안을 확인한다. 글·사진·첨부 설명을 입력하고 새로고침 후 이어서 쓰기로 복구한다.
- 쪽지 내용에 `응답유실`을 포함해 제출하면 최초 1회는 저장 뒤 503을 반환한다. 새로고침·초안 복구 후 재제출하고 `/fixture-status`의 `notes`가 1인지 확인한다. 가짜 서버의 메모리 데이터는 종료하면 사라진다.
- `/draft-store-test`: 검증 시작 버튼으로 실제 IndexedDB의 글·원본 복구, 계정/저금통 격리, 동시 쓰기 충돌, 완료 정리와 삭제 후 오래된 쓰기 차단을 확인한다. 시험 전용 scope만 사용한다.

이 도구의 메모리 API 결과는 실제 서버의 인증·트랜잭션 검증을 대신하지 않는다. 관련 Java 테스트는 `test` 프로필과 임시 MariaDB를 사용한다. 화면 스크립트·시험 서버는 운영 빌드에 포함하지 않는다.
