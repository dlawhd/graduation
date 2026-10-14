# 저장된 저금통의 3D 텍스처 읽기

- `GET /api/v1/jars/{jarId}/design/texture?part=IMAGE|BODY`: 로그인한 활성 멤버만 저장된 디자인 PNG를 읽는다. 탈퇴/비멤버는 403, 없는 디자인/테두리는 404, 잘못된 part/번호는 400이다.
- 응답은 `image/png`, `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`. 오류 시 S3 키/서명을 노출하지 않는다. 외부 URL/키를 요청 입력으로 받지 않는다.
- `JarDesignResponse`에 선택 필드 `imageTextureUrl`, `bodyArtworkTextureUrl`을 추가한다. 기존 `imageUrl`, `bodyArtworkUrl`, 저장 좌표와 DTO 생성자를 유지한다. DB 마이그레이션은 없다.
- 짧은 읽기 트랜잭션에서 멤버/저장 키를 조회하고 S3 I/O는 트랜잭션 밖에서 실행한다. PNG/16MiB 제한을 적용한다.
- 프론트는 3D를 켤 때만 기존 인증 API 모듈로 Blob을 읽고 로컬 URL로 사용한다. 회전/사진 배치만 바뀌면 다시 읽지 않는다. 종료/변경 시 요청 취소와 Blob URL/GPU 해제를 수행한다.
- 서버 필드가 없는 이전 응답/로컬 예시는 기존 URL로 호환된다. 저장 전 Draft의 Presigned 이미지 읽기는 기존 CORS 경로를 유지한다.
- 백엔드와 프론트 반영이 모두 필요하다. 운영 배포/S3 접근과 실제 사용자 이미지 검증은 로컬 합성·Mock 검증과 별개다.
