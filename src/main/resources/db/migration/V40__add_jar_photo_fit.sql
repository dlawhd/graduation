-- V39 사진 배치 NULL은 그대로 둔다. 기존 배치의 방식 NULL은 앱에서 COVER로 해석한다.
-- 원본 영역도 같은 Embeddable을 사용하되 원본 자체에는 표시 방식 변경을 적용하지 않는다.
ALTER TABLE jar_design_drafts
    ADD COLUMN photo_fit VARCHAR(10) NULL,
    ADD COLUMN original_fit VARCHAR(10) NULL,
    ADD CONSTRAINT chk_draft_photo_fit CHECK (
        photo_fit IS NULL OR (photo_x IS NOT NULL AND photo_fit IN ('COVER', 'CONTAIN'))),
    ADD CONSTRAINT chk_draft_original_fit CHECK (
        original_fit IS NULL OR (original_x IS NOT NULL AND original_fit = 'COVER'));

ALTER TABLE jar_designs
    ADD COLUMN photo_fit VARCHAR(10) NULL,
    ADD CONSTRAINT chk_design_photo_fit CHECK (
        photo_fit IS NULL OR (photo_x IS NOT NULL AND photo_fit IN ('COVER', 'CONTAIN')));
