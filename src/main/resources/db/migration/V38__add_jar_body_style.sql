-- NULL은 본체 도입 전의 이미지 자체를 표시하는 디자인이다. 기존 행을 재해석하거나 이미지를 바꾸지 않는다.
ALTER TABLE jar_design_drafts
    ADD COLUMN body_style VARCHAR(30) NULL,
    ADD CONSTRAINT chk_draft_body_style CHECK (body_style IS NULL OR body_style IN (
        'CLASSIC','BELLO','APOTHECARY','MILK','FACET','PERFUME','DOME','HEART','STAR','MOON',
        'CLOUD','SHELL','PEARL','CRYSTAL','PLANET','ROCKET','HOUSE','CASTLE','TEAPOT','LANTERN',
        'PIG','CAT','BEAR','RABBIT','PANDA','PENGUIN','WHALE','MUSHROOM','ACORN','FLOWER'));

ALTER TABLE jar_designs
    ADD COLUMN body_style VARCHAR(30) NULL,
    ADD CONSTRAINT chk_design_body_style CHECK (body_style IS NULL OR body_style IN (
        'CLASSIC','BELLO','APOTHECARY','MILK','FACET','PERFUME','DOME','HEART','STAR','MOON',
        'CLOUD','SHELL','PEARL','CRYSTAL','PLANET','ROCKET','HOUSE','CASTLE','TEAPOT','LANTERN',
        'PIG','CAT','BEAR','RABBIT','PANDA','PENGUIN','WHALE','MUSHROOM','ACORN','FLOWER'));
