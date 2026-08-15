-- V28__add_caption_to_note_attachments.sql
--
-- 쪽지에 들어간 사진/영상마다
-- 짧은 추억 설명을 저장할 수 있도록 caption 컬럼을 추가한다.
--
-- 예:
-- "우리 첫 부산 여행"
--
-- 설명 입력은 선택이므로 NULL을 허용한다.

ALTER TABLE note_attachments
    ADD COLUMN caption VARCHAR(200) NULL
    AFTER size;