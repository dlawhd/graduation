-- 회전된 토큰을 같은 기기의 로그인으로 묶는다. 기존 행은 개별 묶음으로 보존한다.
ALTER TABLE refresh_tokens ADD COLUMN session_id VARCHAR(64) NULL;
UPDATE refresh_tokens SET session_id = CONCAT('legacy-', token_id) WHERE session_id IS NULL;
ALTER TABLE refresh_tokens MODIFY session_id VARCHAR(64) NOT NULL;
CREATE INDEX idx_refresh_tokens_session ON refresh_tokens (user_id, session_id, revoked_at, expires_at);
