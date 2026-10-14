-- 과거 단색 도면과 이미 적용된 V51은 그대로 두고 테두리 그림만 별도로 보관한다.
ALTER TABLE jar_design_drafts ADD COLUMN body_artwork_s3_key VARCHAR(512) NULL,
    DROP CONSTRAINT chk_draft_custom_body,
    ADD CONSTRAINT chk_draft_custom_body CHECK ((custom_body_json IS NULL OR (JSON_VALID(custom_body_json) AND CHAR_LENGTH(custom_body_json)<=49152))
        AND (body_style IS NULL OR body_style<>'CUSTOM' OR custom_body_json IS NOT NULL)
        AND (body_artwork_s3_key IS NULL OR custom_body_json IS NOT NULL));
ALTER TABLE jar_designs ADD COLUMN body_artwork_s3_key VARCHAR(512) NULL,
    DROP CONSTRAINT chk_design_custom_body,
    ADD CONSTRAINT chk_design_custom_body CHECK ((custom_body_json IS NULL OR (JSON_VALID(custom_body_json) AND CHAR_LENGTH(custom_body_json)<=49152))
        AND (body_style IS NULL OR body_style<>'CUSTOM' OR custom_body_json IS NOT NULL)
        AND (body_artwork_s3_key IS NULL OR (body_style IS NOT NULL AND body_style='CUSTOM' AND custom_body_json IS NOT NULL)));
