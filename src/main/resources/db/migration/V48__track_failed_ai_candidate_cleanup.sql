-- 성공 후보의 기존 상태 계약은 유지하고, 업로드 전에 예약한 임시 파일의 삭제를 별도로 추적한다.
ALTER TABLE jar_ai_generations
    ADD COLUMN candidate_upload_s3_key VARCHAR(512) NULL,
    ADD COLUMN candidate_cleanup_at DATETIME(6) NULL,
    ADD INDEX idx_ai_failed_candidate_cleanup (status, candidate_cleanup_at, completed_at, generation_id);
