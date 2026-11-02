-- 기존 AI 문의를 보존하고 사진/후보가 없는 일반 문의와 로그인 도움을 함께 수용한다.
CREATE TABLE support_guest_sessions (
    guest_session_id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    token_hash CHAR(64) NULL UNIQUE,
    expires_at DATETIME(6) NOT NULL,
    created_at DATETIME(6) NOT NULL,
    INDEX idx_support_guest_expiry (expires_at)
);
CREATE TABLE support_rate_limits (
    rate_key CHAR(64) NOT NULL PRIMARY KEY,
    window_start DATETIME(6) NOT NULL,
    used_count INT NOT NULL DEFAULT 0,
    updated_at DATETIME(6) NOT NULL,
    INDEX idx_support_rate_cleanup (updated_at)
);
ALTER TABLE support_inquiries
    MODIFY owner_id BIGINT NULL,
    MODIFY generation_id BIGINT NULL,
    MODIFY draft_id BIGINT NULL,
    MODIFY style VARCHAR(30) NULL,
    MODIFY error_code VARCHAR(50) NULL,
    MODIFY model VARCHAR(150) NULL,
    MODIFY prompt_version VARCHAR(100) NULL,
    MODIFY failed_at DATETIME(6) NULL,
    MODIFY image_s3_key VARCHAR(512) NULL,
    MODIFY image_expires_at DATETIME(6) NULL,
    MODIFY sharing_agreed_at DATETIME(6) NULL,
    ADD COLUMN guest_session_id BIGINT NULL,
    ADD COLUMN category VARCHAR(30) NOT NULL DEFAULT 'AI_GENERATION',
    ADD COLUMN title VARCHAR(100) NULL,
    ADD COLUMN client_request_id CHAR(36) NULL,
    ADD COLUMN request_fingerprint CHAR(64) NULL,
    ADD COLUMN context_jar_id BIGINT NULL,
    ADD COLUMN context_path VARCHAR(120) NULL,
    ADD COLUMN client_error_code VARCHAR(80) NULL,
    ADD COLUMN occurred_at DATETIME(6) NULL,
    ADD COLUMN resolved_at DATETIME(6) NULL,
    ADD COLUMN last_submitted_at DATETIME(6) NULL,
    ADD CONSTRAINT fk_support_guest FOREIGN KEY (guest_session_id) REFERENCES support_guest_sessions(guest_session_id),
    ADD CONSTRAINT chk_support_actor CHECK ((owner_id IS NOT NULL AND guest_session_id IS NULL) OR (owner_id IS NULL AND guest_session_id IS NOT NULL)),
    ADD CONSTRAINT uk_support_owner_request UNIQUE (owner_id, client_request_id),
    ADD CONSTRAINT uk_support_guest_request UNIQUE (guest_session_id, client_request_id);
UPDATE support_inquiries SET last_submitted_at=COALESCE(sharing_agreed_at,created_at);
ALTER TABLE support_inquiries MODIFY last_submitted_at DATETIME(6) NOT NULL;
ALTER TABLE support_inquiries DROP CONSTRAINT chk_support_status,
    ADD CONSTRAINT chk_support_status CHECK (status IN ('COPYING','COPY_FAILED','OPEN','IN_PROGRESS','ANSWERED','WAITING_USER','RESOLVED'));
-- replied_at은 최초 답변 시각이다. 추가 대화/재개 후에도 기존 답변을 보존한다.
ALTER TABLE support_inquiries DROP CONSTRAINT chk_support_reply,
    ADD CONSTRAINT chk_support_reply CHECK ((reply IS NULL AND replied_at IS NULL) OR replied_at IS NOT NULL);
CREATE INDEX idx_support_guest_list ON support_inquiries(guest_session_id, inquiry_id);
CREATE INDEX idx_support_owner_recent ON support_inquiries(owner_id, created_at);
CREATE INDEX idx_support_owner_submitted ON support_inquiries(owner_id, last_submitted_at);
CREATE INDEX idx_support_guest_recent ON support_inquiries(guest_session_id, created_at);
CREATE TABLE support_messages (
    message_id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    inquiry_id BIGINT NOT NULL,
    author_id BIGINT NULL,
    author_role VARCHAR(12) NOT NULL,
    content VARCHAR(3000) NOT NULL,
    client_request_id CHAR(36) NULL,
    waiting_for_user BOOLEAN NOT NULL DEFAULT FALSE,
    created_at DATETIME(6) NOT NULL,
    CONSTRAINT fk_support_message_inquiry FOREIGN KEY(inquiry_id) REFERENCES support_inquiries(inquiry_id),
    CONSTRAINT uk_support_message_request UNIQUE(inquiry_id, client_request_id),
    CONSTRAINT chk_support_message_role CHECK(author_role IN ('USER','OPERATOR','GUEST')),
    INDEX idx_support_message_page (inquiry_id, message_id)
);
INSERT INTO support_messages(inquiry_id, author_role, content, created_at)
    SELECT inquiry_id, 'OPERATOR', reply, replied_at FROM support_inquiries WHERE reply IS NOT NULL;
CREATE TABLE support_attachments (
    attachment_id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    inquiry_id BIGINT NOT NULL,
    client_request_id CHAR(36) NOT NULL,
    author_id BIGINT NULL,
    guest_session_id BIGINT NULL,
    storage_key VARCHAR(512) NOT NULL UNIQUE,
    status VARCHAR(12) NOT NULL,
    byte_size BIGINT NULL,
    expires_at DATETIME(6) NOT NULL,
    created_at DATETIME(6) NOT NULL,
    deleted_at DATETIME(6) NULL,
    CONSTRAINT fk_support_attachment_inquiry FOREIGN KEY(inquiry_id) REFERENCES support_inquiries(inquiry_id),
    CONSTRAINT uk_support_attachment_request UNIQUE(inquiry_id, client_request_id),
    CONSTRAINT chk_support_attachment_status CHECK(status IN ('UPLOADING','READY','FAILED')),
    INDEX idx_support_attachment_page (inquiry_id, attachment_id),
    INDEX idx_support_attachment_visible (inquiry_id, status, deleted_at, expires_at),
    INDEX idx_support_attachment_cleanup (deleted_at, expires_at)
);
ALTER TABLE notifications DROP CONSTRAINT chk_notifications_type,
    ADD CONSTRAINT chk_notifications_type CHECK (type IN (
        'NOTE_COMMENTED','COMMENT_REPLIED','NOTE_REACTED','JAR_MEMBER_JOINED',
        'SUPPORT_REPLIED','SUPPORT_INQUIRY_RECEIVED','SUPPORT_FOLLOWED_UP'
    ));
