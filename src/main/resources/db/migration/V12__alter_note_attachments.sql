-- V12__alter_note_attachments_updated_at.sql
-- note_attachments 테이블의 updated_at 컬럼이 수정될 때마다
-- 자동으로 현재 시각으로 갱신되도록 바꾸는 마이그레이션

ALTER TABLE note_attachments
    MODIFY COLUMN updated_at DATETIME(6) NOT NULL
    DEFAULT CURRENT_TIMESTAMP(6)
    ON UPDATE CURRENT_TIMESTAMP(6);