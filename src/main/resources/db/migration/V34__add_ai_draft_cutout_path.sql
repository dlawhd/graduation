-- Draft 선택 이미지의 배경 제거 외곽선만 JSON으로 보관한다.
-- 원본·AI 후보 파일은 수정하지 않고, Finalize 시 이 좌표로 최종 PNG만 투명 처리한다.
ALTER TABLE jar_design_drafts
    ADD COLUMN cutout_path_json MEDIUMTEXT NULL AFTER selected_generation_id;
