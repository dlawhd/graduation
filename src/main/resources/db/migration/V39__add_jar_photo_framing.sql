-- 기존 행의 NULL 배치는 기존 contain 표시를 유지한다. 기존 사진을 재처리하거나 백필하지 않는다.
ALTER TABLE jar_design_drafts
    ADD COLUMN photo_x DECIMAL(7,6) NULL,
    ADD COLUMN photo_y DECIMAL(7,6) NULL,
    ADD COLUMN photo_width DECIMAL(7,6) NULL,
    ADD COLUMN photo_height DECIMAL(7,6) NULL,
    ADD COLUMN original_x DECIMAL(7,6) NULL,
    ADD COLUMN original_y DECIMAL(7,6) NULL,
    ADD COLUMN original_width DECIMAL(7,6) NULL,
    ADD COLUMN original_height DECIMAL(7,6) NULL,
    ADD CONSTRAINT chk_draft_photo_frame CHECK (
      (photo_x IS NULL AND photo_y IS NULL AND photo_width IS NULL AND photo_height IS NULL)
      OR (body_style IS NOT NULL AND selected_design_type IS NOT NULL AND selected_design_type IN ('ORIGINAL','AI')
        AND photo_x IS NOT NULL AND photo_y IS NOT NULL AND photo_width IS NOT NULL AND photo_height IS NOT NULL
        AND photo_x >= 0 AND photo_y >= 0 AND photo_width >= 0.000001 AND photo_height >= 0.000001
        AND photo_x + photo_width <= 1 AND photo_y + photo_height <= 1)),
    ADD CONSTRAINT chk_draft_original_frame CHECK (
      (original_x IS NULL AND original_y IS NULL AND original_width IS NULL AND original_height IS NULL)
      OR (original_x IS NOT NULL AND original_y IS NOT NULL AND original_width IS NOT NULL AND original_height IS NOT NULL
        AND original_x >= 0 AND original_y >= 0 AND original_width > 0 AND original_height > 0
        AND original_x + original_width <= 1 AND original_y + original_height <= 1));

ALTER TABLE jar_designs
    ADD COLUMN photo_x DECIMAL(7,6) NULL,
    ADD COLUMN photo_y DECIMAL(7,6) NULL,
    ADD COLUMN photo_width DECIMAL(7,6) NULL,
    ADD COLUMN photo_height DECIMAL(7,6) NULL,
    ADD CONSTRAINT chk_design_photo_frame CHECK (
      (photo_x IS NULL AND photo_y IS NULL AND photo_width IS NULL AND photo_height IS NULL)
      OR (body_style IS NOT NULL AND photo_x IS NOT NULL AND photo_y IS NOT NULL AND photo_width IS NOT NULL AND photo_height IS NOT NULL
        AND photo_x >= 0 AND photo_y >= 0 AND photo_width >= 0.000001 AND photo_height >= 0.000001
        AND photo_x + photo_width <= 1 AND photo_y + photo_height <= 1));
