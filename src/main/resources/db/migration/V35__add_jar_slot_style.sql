-- 기존 위치/크기와 PNG는 변경하지 않고 투입구 표시 종류만 추가한다.
ALTER TABLE jar_design_drafts
    ADD COLUMN slot_style VARCHAR(20) NOT NULL DEFAULT 'CAPSULE',
    ADD CONSTRAINT chk_draft_slot_style CHECK (slot_style IN ('CAPSULE','RECTANGLE','OVAL','METAL','WOOD','PIXEL'));

ALTER TABLE jar_designs
    ADD COLUMN slot_style VARCHAR(20) NOT NULL DEFAULT 'CAPSULE',
    ADD CONSTRAINT chk_design_slot_style CHECK (slot_style IN ('CAPSULE','RECTANGLE','OVAL','METAL','WOOD','PIXEL'));
