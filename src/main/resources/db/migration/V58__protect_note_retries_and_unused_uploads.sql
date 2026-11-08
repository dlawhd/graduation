-- 기존 클라이언트의 NULL 요청 번호는 허용하고 새 요청의 중복만 차단한다.
ALTER TABLE notes
    ADD COLUMN client_request_id VARCHAR(64) NULL,
    ADD COLUMN request_fingerprint VARCHAR(64) NULL,
    ADD CONSTRAINT uk_notes_create_request UNIQUE (jar_id, author_id, client_request_id);

-- 미사용 NOTE 완료 파일만 7일 후 정리한다. 실제 첨부와 연결된 파일은 대상에서 제외한다.
ALTER TABLE file_uploads
    ADD COLUMN unused_cleanup_after DATETIME(6) NULL,
    ADD COLUMN unused_cleaned_at DATETIME(6) NULL;
UPDATE file_uploads SET unused_cleanup_after = DATE_ADD(completed_at, INTERVAL 7 DAY)
WHERE purpose = 'NOTE' AND status = 'COMPLETED' AND completed_at IS NOT NULL;
CREATE INDEX idx_uploads_unused_cleanup ON file_uploads(status, unused_cleanup_after);
