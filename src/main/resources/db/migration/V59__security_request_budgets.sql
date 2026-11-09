-- 식별자 원문은 저장하지 않고 HMAC 키로만 요청 예산을 직렬화한다.
CREATE TABLE security_request_limits (
    budget_key CHAR(64) PRIMARY KEY,
    window_start DATETIME(6) NOT NULL,
    used_count INT NOT NULL DEFAULT 0,
    updated_at DATETIME(6) NOT NULL,
    INDEX idx_security_budget_cleanup (updated_at)
);
