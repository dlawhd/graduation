-- 기존 완료 파일은 최소 7일 보관 후 참조가 없는 경우에만 정리한다.
UPDATE file_uploads SET unused_cleanup_after=DATE_ADD(COALESCE(completed_at,created_at), INTERVAL 7 DAY)
WHERE purpose IN ('PROFILE','JAR') AND status='COMPLETED' AND unused_cleanup_after IS NULL;
CREATE INDEX idx_file_upload_account_usage ON file_uploads(user_id,status,created_at);
CREATE INDEX idx_design_final_read ON jar_designs(final_s3_key);
CREATE INDEX idx_design_artwork_read ON jar_designs(body_artwork_s3_key);
CREATE INDEX idx_draft_original_read ON jar_design_drafts(original_s3_key);
CREATE INDEX idx_draft_artwork_read ON jar_design_drafts(body_artwork_s3_key);
CREATE INDEX idx_generation_image_read ON jar_ai_generations(generated_s3_key);
CREATE INDEX idx_generation_candidate_read ON jar_ai_generations(candidate_upload_s3_key);
