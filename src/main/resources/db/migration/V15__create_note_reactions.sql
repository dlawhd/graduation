-- V15__create_note_reactions.sql
-- 이 테이블은 "쪽지에 남긴 이모지 반응"을 저장하는 테이블
-- v1에서는 "한 사람이 한 쪽지에 리액션 1개만" 누를 수 있게 만든다.
-- 예:
-- 1) 내가 LOVE를 누르면 저장
-- 2) 내가 다시 LOVE를 누르면 삭제
-- 3) 내가 SMILE을 누르면 기존 LOVE를 SMILE로 바꾸는 식으로 사용함

CREATE TABLE note_reactions (
    -- 리액션 하나마다 붙는 고유 번호표
    reaction_id BIGINT NOT NULL AUTO_INCREMENT,

    -- 어떤 쪽지에 단 리액션인지
    note_id BIGINT NOT NULL,

    -- 누가 누른 리액션인지
    user_id BIGINT NOT NULL,

    -- 어떤 반응인지
    -- DB에는 실제 이모지 문자(👍) 대신 enum 이름(LIKE)을 저장하는 걸 추천
    -- 이유:
    -- 1) 백엔드 enum과 맞추기 쉽고
    -- 2) 정렬/비교/검증이 더 단순해지고
    -- 3) 나중에 프론트에서 아이콘 매핑하기도 쉬움
    emoji VARCHAR(30) NOT NULL,

    -- 언제 처음 눌렀는지
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    -- 마지막으로 바뀐 시간
    -- 예: LIKE -> LOVE 로 바뀌면 updated_at 이 갱신
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
        ON UPDATE CURRENT_TIMESTAMP(6),

    PRIMARY KEY (reaction_id),

    -- v1 핵심 규칙
    -- 한 사람이 같은 쪽지에 리액션을 여러 개 중복으로 남기지 못하게 막음
    CONSTRAINT uk_note_reactions_note_user UNIQUE (note_id, user_id),

    -- 리액션은 반드시 실제 존재하는 쪽지에만 달 수 있음
    CONSTRAINT fk_note_reactions_note
        FOREIGN KEY (note_id) REFERENCES notes(note_id),

    -- 리액션은 반드시 실제 사용자만 남길 수 있음
    CONSTRAINT fk_note_reactions_user
        FOREIGN KEY (user_id) REFERENCES users(id),

    -- v1에서 허용할 리액션 종류를 미리 막아두는 안전장치야.
    -- 프론트/백엔드/DB가 같은 값만 쓰게 맞춰주는 역할을 해.
    CONSTRAINT chk_note_reactions_emoji
        CHECK (emoji IN (
            'LOVE',
            'SMILE',
            'LAUGH',
            'TOUCHING',
            'MISS_YOU',
            'PROUD',
            'CHEER',
            'THANKFUL'
        ))
);

-- 어떤 쪽지에 리액션이 달렸는지 빠르게 찾기 위한 인덱스
CREATE INDEX idx_note_reactions_note_id
    ON note_reactions(note_id);

-- 쪽지 상세/목록에서 "LOVE 몇 개, SMILE 몇 개"처럼 리액션 개수를 집계할 때 도움 되는 인덱스
CREATE INDEX idx_note_reactions_note_id_emoji
    ON note_reactions(note_id, emoji);

-- "내가 누른 리액션" 조회나 디버깅할 때 도움 되는 인덱스
CREATE INDEX idx_note_reactions_user_id
    ON note_reactions(user_id);