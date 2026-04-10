-- V13__alter_notes_add_tags_json.sql
-- 쪽지(notes) 테이블에 태그 저장용 칼럼을 추가하는 마이그레이션
-- 따로 note_tags 테이블을 만들지 않고, notes 테이블 안에 JSON 문자열 형태로 저장
-- 이유: 1) 지금은 태그 검색이 프론트에서 notes 응답값을 가지고 필터링하는 구조라서 notes에 바로 붙여도 충분해
--      2) 구조가 단순해서 빠르게 붙이기 좋음

ALTER TABLE notes
    ADD COLUMN tags_json TEXT NULL AFTER location;