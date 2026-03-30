-- V9__create_notes.sql

-- notes 테이블은 저금통 안에 들어가는 "추억 쪽지 본체"야.
-- 누구 저금통인지, 누가 썼는지, 내용이 무엇인지 저장해.
CREATE TABLE notes (

    -- 쪽지 번호표
    note_id BIGINT NOT NULL AUTO_INCREMENT,

    -- 어느 저금통에 있는지
    jar_id BIGINT NOT NULL,

    -- 누가 썼는지
    author_id BIGINT NOT NULL,

    -- 제목은 필수.
    title VARCHAR(100) NOT NULL,

    -- 쪽지 본문이야.
    -- 추억 글은 길어질 수 있으니 TEXT보다 여유 있게 LONGTEXT로 잡아두는 걸 추천해.
    content LONGTEXT NOT NULL,

    -- 나중에 AES 암호화 모드가 들어와도 바로 대응할 수 있게 미리 넣어두는 값이야.
    -- 0 = 일반 텍스트
    -- 1 = 암호화된 내용
    is_encrypted TINYINT(1) NOT NULL DEFAULT 0,

    -- 실제 추억이 있었던 날짜
    -- 작성 날짜와 다를 수 있어서 따로 둬.
    note_date DATE NULL,

    -- 장소도 선택값
    location VARCHAR(100) NULL,

    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    deleted_at DATETIME(6) NULL,

    PRIMARY KEY (note_id),

    CONSTRAINT fk_notes_jar
        FOREIGN KEY (jar_id) REFERENCES jars(jar_id),

    CONSTRAINT fk_notes_author
        FOREIGN KEY (author_id) REFERENCES users(id),

    CONSTRAINT chk_notes_is_encrypted
        CHECK (is_encrypted IN (0, 1))
);

-- 저금통별 쪽지 목록 조회가 많을 거라서 필요해.
CREATE INDEX idx_notes_jar_id ON notes(jar_id);

-- 작성자 기준 조회나 "내가 쓴 쪽지" 기능에 도움 돼.
CREATE INDEX idx_notes_author_id ON notes(author_id);

-- 상세/목록에서 삭제 안 된 데이터만 자주 볼 거라서 묶어두면 좋아.
CREATE INDEX idx_notes_jar_id_deleted_at_created_at
    ON notes(jar_id, deleted_at, created_at);

-- 날짜 기반 필터링용
CREATE INDEX idx_notes_note_date ON notes(note_date);