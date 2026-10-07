-- 기존 도면은 보존하고 사용자가 직접 그린 틀의 좌표/색상만 추가한다.
ALTER TABLE jar_design_drafts ADD COLUMN custom_body_json TEXT NULL,
    DROP CONSTRAINT chk_draft_body_style,
    ADD CONSTRAINT chk_draft_body_style CHECK (body_style IS NULL OR body_style IN (
        'CLASSIC','BELLO','APOTHECARY','MILK','FACET','PERFUME','DOME','HEART','STAR','MOON',
        'CLOUD','SHELL','PEARL','CRYSTAL','PLANET','ROCKET','HOUSE','CASTLE','TEAPOT','LANTERN',
        'PIG','CAT','BEAR','RABBIT','PANDA','PENGUIN','WHALE','MUSHROOM','ACORN','FLOWER',
        'SHIBA','CORGI','FOX','RACCOON','KOALA','RED_PANDA','OTTER','SEAL','HAMSTER','HEDGEHOG',
        'SQUIRREL','DEER','OWL','CHICK','DUCK','TURTLE','FROG','AXOLOTL','ELEPHANT','CAPYBARA','CUSTOM')),
    ADD CONSTRAINT chk_draft_custom_body CHECK ((custom_body_json IS NULL OR (JSON_VALID(custom_body_json) AND CHAR_LENGTH(custom_body_json)<=16384))
        AND (body_style IS NULL OR body_style<>'CUSTOM' OR custom_body_json IS NOT NULL));
ALTER TABLE jar_designs ADD COLUMN custom_body_json TEXT NULL,
    DROP CONSTRAINT chk_design_body_style,
    ADD CONSTRAINT chk_design_body_style CHECK (body_style IS NULL OR body_style IN (
        'CLASSIC','BELLO','APOTHECARY','MILK','FACET','PERFUME','DOME','HEART','STAR','MOON',
        'CLOUD','SHELL','PEARL','CRYSTAL','PLANET','ROCKET','HOUSE','CASTLE','TEAPOT','LANTERN',
        'PIG','CAT','BEAR','RABBIT','PANDA','PENGUIN','WHALE','MUSHROOM','ACORN','FLOWER',
        'SHIBA','CORGI','FOX','RACCOON','KOALA','RED_PANDA','OTTER','SEAL','HAMSTER','HEDGEHOG',
        'SQUIRREL','DEER','OWL','CHICK','DUCK','TURTLE','FROG','AXOLOTL','ELEPHANT','CAPYBARA','CUSTOM')),
    ADD CONSTRAINT chk_design_custom_body CHECK ((custom_body_json IS NULL OR (JSON_VALID(custom_body_json) AND CHAR_LENGTH(custom_body_json)<=16384))
        AND (body_style IS NULL OR body_style<>'CUSTOM' OR custom_body_json IS NOT NULL));
