-- 기존 PNG·입구 좌표·크기·기본값은 변경하지 않고 장식 입구 18종의 허용값만 추가한다.
ALTER TABLE jar_design_drafts
    DROP CONSTRAINT chk_draft_slot_style,
    ADD CONSTRAINT chk_draft_slot_style CHECK (slot_style IN (
        'CAPSULE','RECTANGLE','OVAL','METAL','WOOD','PIXEL',
        'BRASS','ROSE_GOLD','OBSIDIAN','PEARL','PORCELAIN','LEATHER',
        'LEAF','BAMBOO','BLOSSOM','PAW','SHELL','RIPPLE',
        'STARLIGHT','MOONLIGHT','AURORA','CRYSTAL','RIBBON','KEYHOLE'));

ALTER TABLE jar_designs
    DROP CONSTRAINT chk_design_slot_style,
    ADD CONSTRAINT chk_design_slot_style CHECK (slot_style IN (
        'CAPSULE','RECTANGLE','OVAL','METAL','WOOD','PIXEL',
        'BRASS','ROSE_GOLD','OBSIDIAN','PEARL','PORCELAIN','LEATHER',
        'LEAF','BAMBOO','BLOSSOM','PAW','SHELL','RIPPLE',
        'STARLIGHT','MOONLIGHT','AURORA','CRYSTAL','RIBBON','KEYHOLE'));
