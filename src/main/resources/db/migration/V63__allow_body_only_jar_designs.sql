-- 저금통 모양만 쓰는 초안과 완성 디자인은 저장할 원본 파일이 없다.
ALTER TABLE jar_design_drafts
    DROP CONSTRAINT chk_jar_design_drafts_original_s3_key,
    DROP CONSTRAINT chk_jar_design_drafts_design_selection,
    DROP CONSTRAINT chk_jar_design_drafts_slot_for_design,
    DROP CONSTRAINT chk_jar_design_drafts_finalized_slot,
    MODIFY COLUMN original_s3_key VARCHAR(512) NULL,
    ADD CONSTRAINT chk_jar_design_drafts_original_s3_key CHECK (
        (COALESCE(selected_design_type, '') = 'BODY_ONLY' AND original_s3_key IS NULL AND body_style IS NOT NULL)
        OR (COALESCE(selected_design_type, '') <> 'BODY_ONLY'
            AND original_s3_key IS NOT NULL AND CHAR_LENGTH(TRIM(original_s3_key)) > 0)
    ),
    ADD CONSTRAINT chk_jar_design_drafts_design_selection CHECK (
        (COALESCE(selected_design_type, '') = 'AI' AND selected_generation_id IS NOT NULL)
        OR ((selected_design_type IS NULL OR selected_design_type IN ('ORIGINAL', 'BODY_ONLY', 'DEFAULT'))
            AND selected_generation_id IS NULL)
    ),
    ADD CONSTRAINT chk_jar_design_drafts_slot_for_design CHECK (
        COALESCE(selected_design_type, '') IN ('ORIGINAL', 'AI', 'BODY_ONLY')
        OR ((selected_design_type IS NULL OR selected_design_type = 'DEFAULT')
            AND slot_center_x IS NULL AND slot_center_y IS NULL AND slot_size_ratio IS NULL)
    ),
    ADD CONSTRAINT chk_jar_design_drafts_finalized_slot CHECK (
        status <> 'FINALIZED'
        OR (selected_design_type = 'DEFAULT'
            AND slot_center_x IS NULL AND slot_center_y IS NULL AND slot_size_ratio IS NULL)
        OR (selected_design_type IN ('ORIGINAL', 'AI', 'BODY_ONLY')
            AND slot_center_x IS NOT NULL AND slot_center_y IS NOT NULL AND slot_size_ratio IS NOT NULL)
    );

ALTER TABLE jar_designs
    DROP CONSTRAINT chk_jar_designs_type_selection,
    DROP CONSTRAINT chk_jar_designs_final_s3_key,
    MODIFY COLUMN final_s3_key VARCHAR(512) NULL,
    ADD CONSTRAINT chk_jar_designs_type_selection CHECK (
        (design_type IN ('ORIGINAL', 'BODY_ONLY') AND selected_generation_id IS NULL)
        OR (design_type = 'AI' AND selected_generation_id IS NOT NULL)
    ),
    ADD CONSTRAINT chk_jar_designs_final_s3_key CHECK (
        (design_type = 'BODY_ONLY' AND final_s3_key IS NULL AND body_style IS NOT NULL)
        OR (design_type IN ('ORIGINAL', 'AI')
            AND final_s3_key IS NOT NULL AND CHAR_LENGTH(TRIM(final_s3_key)) > 0)
    );
