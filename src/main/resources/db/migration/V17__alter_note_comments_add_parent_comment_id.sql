-- V17__alter_note_comments_add_parent_comment_id.sql

-- 이 파일은 note_comments 테이블에 "부모 댓글 번호"를 추가해서 대댓글을 저장할 수 있게 만드는 역할

ALTER TABLE note_comments
    ADD COLUMN parent_comment_id BIGINT NULL AFTER note_id;

ALTER TABLE note_comments
    ADD CONSTRAINT fk_note_comments_parent_comment
        FOREIGN KEY (parent_comment_id) REFERENCES note_comments(comment_id);

-- 같은 쪽지 안에서 "부모 댓글 -> 자식 댓글" 조회를 빠르게 하기 위한 인덱스
CREATE INDEX idx_note_comments_note_parent_created
    ON note_comments(note_id, parent_comment_id, deleted_at, created_at, comment_id);