-- 기존 JWT에는 버전이 없으므로 0으로 취급하여 최초 배포 시 로그인 호환성을 유지한다.
ALTER TABLE users ADD COLUMN session_version BIGINT NOT NULL DEFAULT 0;
