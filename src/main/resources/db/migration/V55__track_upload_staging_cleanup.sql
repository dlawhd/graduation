-- 브라우저 업로드 URL이 만료된 후 임시 객체만 정리한다. 실패 기록은 다음 실행에 남는다.
ALTER TABLE file_uploads
    ADD COLUMN staging_cleanup_after DATETIME(6) NULL,
    ADD COLUMN staging_cleaned_at DATETIME(6) NULL;
-- 과거 발급 URL의 실제 만료를 알 수 없으므로 S3 최대 서명 기간(7일)보다 길게 보존한다.
UPDATE file_uploads SET staging_cleanup_after = DATE_ADD(created_at, INTERVAL 8 DAY);
CREATE INDEX idx_file_uploads_staging_cleanup ON file_uploads (staging_cleaned_at, staging_cleanup_after);
