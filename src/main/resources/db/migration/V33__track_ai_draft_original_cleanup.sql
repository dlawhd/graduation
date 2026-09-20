-- 종료된 AI Draft 원본의 S3 삭제 성공 여부를 기록해 서버 재시작 뒤에도 안전하게 재시도한다.
ALTER TABLE jar_design_drafts
    ADD COLUMN original_s3_deleted_at DATETIME(6) NULL AFTER original_s3_key;

ALTER TABLE jar_design_drafts
    ADD CONSTRAINT chk_jar_design_drafts_original_s3_deleted_at
        CHECK (
            original_s3_deleted_at IS NULL
            OR (
                status IN ('FINALIZED', 'ABANDONED', 'EXPIRED')
                AND original_s3_deleted_at >= created_at
            )
        );

CREATE INDEX idx_jar_design_drafts_original_cleanup
    ON jar_design_drafts (status, original_s3_deleted_at, updated_at);
