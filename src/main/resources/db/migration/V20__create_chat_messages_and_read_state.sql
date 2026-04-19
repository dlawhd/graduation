-- V20__create_chat_messages_and_read_state.sql

-- 이번 V20에서 만드는 것
-- 1) chat_messages   : 채팅 메시지 본문 저장
-- 2) chat_read_state : 사용자별 마지막 읽은 위치 저장

-- 이번 규칙
-- - 채팅 텍스트(content)는 필수
-- - 파일은 필수가 아님
-- - 그래서 "파일 첨부 테이블"은 이번 V20에 넣지 않고 다음 단계(V21)로 분리

-- 이렇게 나누는 이유
-- - 먼저 Polling v1 핵심 기능(저장/조회/unread)부터 안정적으로 만들기 위해서
-- - 파일은 옵션 기능이라 나중에 붙여도 구조가 안 꼬임


-- =========================================================
-- 1. chat_messages
-- =========================================================
-- 역할:
-- - 어느 저금통(jar_id)에서
-- - 누가(sender_id)
-- - 어떤 종류(type)의
-- - 어떤 텍스트(content)를 보냈는지 저장하는 테이블

-- type 설명
-- - TEXT   : 일반 사용자 채팅
-- - SYSTEM : 시스템 메시지
--
-- 이번 버전에서는 "텍스트가 항상 필수"이므로
-- FILE 타입은 아직 두지 않는다.
-- 나중에 파일 첨부가 생겨도 "텍스트 + 첨부파일" 구조로 확장하면 된다.

CREATE TABLE chat_messages (

    -- 메시지 하나마다 붙는 고유 번호표
    message_id BIGINT NOT NULL AUTO_INCREMENT,

    -- 어느 저금통 채팅방의 메시지인지
    jar_id BIGINT NOT NULL,

    -- 누가 보냈는지
    -- 일반 사용자 메시지는 값이 있어야 하고, 시스템 메시지는 NULL일 수 있다.
    sender_id BIGINT NULL,

    -- 메시지 종류
    type VARCHAR(30) NOT NULL,

    -- 채팅 텍스트 본문
    content TEXT NOT NULL,

    -- BaseEntity 규칙에 맞춘 공통 시간 컬럼
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    deleted_at DATETIME(6) NULL,

    PRIMARY KEY (message_id),

    -- 실제 존재하는 저금통에만 메시지를 남길 수 있어야 함
    CONSTRAINT fk_chat_messages_jar
        FOREIGN KEY (jar_id) REFERENCES jars(jar_id),

    -- 실제 존재하는 사용자만 보낼 수 있어야 함
    -- 단, SYSTEM 메시지는 sender_id가 NULL일 수 있음
    CONSTRAINT fk_chat_messages_sender
        FOREIGN KEY (sender_id) REFERENCES users(id),

    -- 현재 허용하는 메시지 타입만 저장되도록 막기
    CONSTRAINT chk_chat_messages_type
        CHECK (type IN ('TEXT', 'SYSTEM')),

    -- content는 비어 있으면 안 됨
    -- 공백만 있는 값("   ")은 DTO의 @NotBlank에서 한 번 더 막아주면 된다.
    CONSTRAINT chk_chat_messages_content_not_empty
        CHECK (CHAR_LENGTH(content) > 0),

    -- TEXT 메시지는 반드시 sender_id가 있어야 하고
    -- SYSTEM 메시지는 sender_id가 없어야 자연스럽다.
    CONSTRAINT chk_chat_messages_sender_type
        CHECK (
            (type = 'TEXT' AND sender_id IS NOT NULL)
            OR
            (type = 'SYSTEM' AND sender_id IS NULL)
        )
);

-- 특정 저금통의 채팅 목록 조회 + 커서 기반 조회에 도움 되는 핵심 인덱스
-- 예:
-- SELECT * FROM chat_messages
-- WHERE jar_id = ? AND deleted_at IS NULL AND message_id < ?
-- ORDER BY message_id DESC
CREATE INDEX idx_chat_messages_jar_deleted_message
    ON chat_messages(jar_id, deleted_at, message_id);

-- 작성자 기준 조회/디버깅/권한 체크 때 도움 되는 인덱스
CREATE INDEX idx_chat_messages_sender_id
    ON chat_messages(sender_id);



-- =========================================================
-- 2. chat_read_state
-- =========================================================
-- 역할:
-- - 사용자 한 명이 특정 저금통 채팅을 어디(message_id)까지 읽었는지 저장하는 테이블

-- unread 계산 방식
-- - 마지막으로 읽은 last_read_message_id 이후의 메시지 수를 세면 된다.

-- 왜 별도 테이블이 필요하냐?
-- - 채팅 메시지 자체와 "각 사용자별 읽은 위치"는 성격이 완전히 다르기 때문

CREATE TABLE chat_read_state (

    -- 읽음 상태 row 하나마다 붙는 고유 번호표
    chat_read_state_id BIGINT NOT NULL AUTO_INCREMENT,

    -- 어느 저금통 채팅의 읽음 상태인지
    jar_id BIGINT NOT NULL,

    -- 누구의 읽음 상태인지
    user_id BIGINT NOT NULL,

    -- 마지막으로 읽은 메시지 ID
    -- 아직 한 번도 안 읽었으면 NULL 가능
    last_read_message_id BIGINT NULL,

    -- BaseEntity 규칙에 맞춘 공통 시간 컬럼
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    deleted_at DATETIME(6) NULL,

    PRIMARY KEY (chat_read_state_id),

    -- 같은 사용자 + 같은 저금통 조합은 딱 1개만 있어야 함
    CONSTRAINT uq_chat_read_state_jar_user
        UNIQUE (jar_id, user_id),

    -- 실제 존재하는 저금통이어야 함
    CONSTRAINT fk_chat_read_state_jar
        FOREIGN KEY (jar_id) REFERENCES jars(jar_id),

    -- 실제 존재하는 사용자여야 함
    CONSTRAINT fk_chat_read_state_user
        FOREIGN KEY (user_id) REFERENCES users(id),

    -- 마지막 읽은 메시지는 실제 존재하는 메시지여야 함
    -- 아직 안 읽은 상태는 NULL 가능
    CONSTRAINT fk_chat_read_state_last_read_message
        FOREIGN KEY (last_read_message_id) REFERENCES chat_messages(message_id)
);

-- 사용자 기준으로 내 unread 상태 조회할 때 도움 되는 인덱스
CREATE INDEX idx_chat_read_state_user_deleted
    ON chat_read_state(user_id, deleted_at);

-- 저금통 기준으로 읽음 상태 조회/정리할 때 도움 되는 인덱스
CREATE INDEX idx_chat_read_state_jar_deleted
    ON chat_read_state(jar_id, deleted_at);