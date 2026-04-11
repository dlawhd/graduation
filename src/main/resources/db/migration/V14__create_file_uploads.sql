-- 이 테이블은 "presign으로 발급된 파일이 실제로 업로드 완료됐는지" 추적하는 역할
-- 아직 note_attachments에 바로 넣지 않고, 먼저 file_uploads에서 검증한 뒤 연결함

CREATE TABLE file_uploads (
    upload_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    purpose VARCHAR(30) NOT NULL,
    status VARCHAR(30) NOT NULL,
    s3_key VARCHAR(500) NOT NULL,
    public_url VARCHAR(1000) NOT NULL,
    content_type VARCHAR(100) NOT NULL,
    size BIGINT NOT NULL,
    completed_at DATETIME(6) NULL,
    consumed_at DATETIME(6) NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    deleted_at DATETIME(6) NULL,

    CONSTRAINT uk_file_uploads_s3_key UNIQUE (s3_key),
    CONSTRAINT fk_file_uploads_user FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX idx_file_uploads_user_id ON file_uploads(user_id);
CREATE INDEX idx_file_uploads_status ON file_uploads(status);
CREATE INDEX idx_file_uploads_purpose_status ON file_uploads(purpose, status);