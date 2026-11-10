-- 인증 앱의 비밀키는 별도 서버 키로 암호화하고, 복구 코드는 해시만 저장한다.
CREATE TABLE operator_mfa_credentials (
    user_id BIGINT PRIMARY KEY,
    encrypted_secret VARCHAR(512),
    pending_secret VARCHAR(512),
    pending_session_key CHAR(64),
    pending_expires_at DATETIME(6),
    enabled_at DATETIME(6),
    last_used_step BIGINT NOT NULL DEFAULT -1,
    recovery_hashes TEXT NOT NULL,
    CONSTRAINT fk_operator_mfa_user FOREIGN KEY (user_id) REFERENCES users(id)
);
-- 추가 인증은 특정 기기의 로그인에만 연결한다. 다른 기기나 새 로그인에는 승계하지 않는다.
CREATE TABLE operator_mfa_proofs (
    session_key CHAR(64) PRIMARY KEY,
    user_id BIGINT NOT NULL,
    session_version BIGINT NOT NULL,
    expires_at DATETIME(6) NOT NULL,
    CONSTRAINT fk_operator_mfa_proof_user FOREIGN KEY (user_id) REFERENCES users(id),
    INDEX idx_operator_mfa_expiry (expires_at)
);
