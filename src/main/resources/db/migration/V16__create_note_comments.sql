-- V16__create_note_comments.sql

-- 이 테이블은 "쪽지 아래에 달리는 댓글"을 저장하는 테이블
-- 쉽게 말하면:
-- - 어떤 쪽지(note)에
-- - 어떤 사용자(user)가
-- - 무슨 댓글(content)을 남겼는지
-- 저장하는 역할

-- 이번에 확정한 규칙
-- 1) 저금통 활성 멤버만 댓글 가능
-- 2) 오픈 전에도 댓글 가능
-- 3) 수정/삭제는 작성자 본인만 가능
-- 4) 댓글은 오래된 순서가 위로 오고, 새 댓글은 아래에 붙음


CREATE TABLE note_comments (

    -- 댓글 하나마다 붙는 고유 번호표
    comment_id BIGINT NOT NULL AUTO_INCREMENT,

    -- 어떤 쪽지에 달린 댓글인지
    note_id BIGINT NOT NULL,

    -- 누가 작성한 댓글인지
    user_id BIGINT NOT NULL,

    -- 댓글 본문
    -- 길이가 어느 정도 길어질 수 있으니 TEXT로 둔다.
    content TEXT NOT NULL,

    -- BaseEntity 규칙에 맞춘 공통 시간 컬럼
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    deleted_at DATETIME(6) NULL,

    PRIMARY KEY (comment_id),

    -- 댓글은 반드시 실제 존재하는 쪽지에만 달 수 있어야 함
    CONSTRAINT fk_note_comments_note
        FOREIGN KEY (note_id) REFERENCES notes(note_id),

    -- 댓글 작성자는 반드시 실제 사용자여야 함
    CONSTRAINT fk_note_comments_user
        FOREIGN KEY (user_id) REFERENCES users(id),

    -- 완전 빈 문자열("")은 DB에서도 한 번 막는 안전장치
    -- 공백만 있는 값("   ")은 DTO의 @NotBlank에서 한 번 더 막아주면 됌
    CONSTRAINT chk_note_comments_content_not_empty
        CHECK (CHAR_LENGTH(content) > 0)
);

-- 특정 쪽지의 댓글 목록을 찾을 때 빠르게 도와주는 기본 인덱스
CREATE INDEX idx_note_comments_note_id
    ON note_comments(note_id);

-- "삭제되지 않은 댓글만" + "오래된 순(created_at ASC, comment_id ASC)" 조회에 도움 되는 핵심 인덱스
-- 댓글이 같은 시간(created_at)으로 찍힐 수도 있어서 comment_id까지 같이 둬서 더 안정적으로 정렬하기 좋게 만든다.
CREATE INDEX idx_note_comments_note_id_deleted_at_created_at_comment_id
    ON note_comments(note_id, deleted_at, created_at, comment_id);

-- 작성자 기준 조회나 권한 체크, 디버깅 때 도움 되는 인덱스
CREATE INDEX idx_note_comments_user_id
    ON note_comments(user_id);