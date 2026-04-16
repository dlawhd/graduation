-- V18__create_notifications.sql

-- 이 테이블은 "인앱 알림함" 역할
-- 쉽게 말하면:
-- - 누가(user_id) 알림을 받는지
-- - 어떤 저금통(jar_id) 관련 알림인지
-- - 어떤 종류(type) 알림인지
-- - 눌렀을 때 어디로 이동해야 하는지(payload_json)
-- - 읽었는지(is_read, read_at)
-- 를 저장하는 테이블
--
-- 이번 v1에서 다룰 알림 종류
-- 1) 내 쪽지에 일반 댓글 달림        -> NOTE_COMMENTED
-- 2) 내 댓글에 대댓글 달림          -> COMMENT_REPLIED
-- 3) 내 쪽지에 리액션 달림          -> NOTE_REACTED
-- 4) 내 저금통에 새 멤버 입장       -> JAR_MEMBER_JOINED
--
-- 참고:
-- payload_json 예시
-- {
--   "jarId": 3,
--   "noteId": 15,
--   "commentId": 8,
--   "actorUserId": 2,
--   "actorName": "누군가",
--   "emoji": "❤️"
-- }
--
-- payload_json은 "이동 정보 + 화면 표시용 정보"를 담는 작은 꾸러미

CREATE TABLE notifications (
    -- 알림 하나마다 붙는 고유 번호표
    notification_id BIGINT NOT NULL AUTO_INCREMENT,

    -- 알림을 받는 사용자
    user_id BIGINT NOT NULL,

    -- 어느 저금통 관련 알림인지
    -- 어떤 알림은 저금통과 연결되는 게 자연스러워서 같이 둔다.
    -- (예: 댓글, 대댓글, 리액션, 새 멤버 입장)
    jar_id BIGINT NULL,

    -- 알림 종류
    -- 이번 v1에서는 4가지만 허용한다.
    type VARCHAR(50) NOT NULL,

    -- 알림 클릭 시 이동에 필요한 정보 + 화면 표시용 정보
    -- JSON 문자열 형태로 저장한다.
    payload_json LONGTEXT NOT NULL,

    -- 읽음 여부
    -- false = 아직 안 읽음
    -- true  = 읽음 처리됨
    is_read BOOLEAN NOT NULL DEFAULT FALSE,

    -- 실제로 읽은 시간
    -- 아직 안 읽었으면 NULL
    read_at DATETIME(6) NULL,

    -- BaseEntity 규칙에 맞춘 공통 시간 컬럼
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    deleted_at DATETIME(6) NULL,

    PRIMARY KEY (notification_id),

    -- 알림은 반드시 실제 존재하는 사용자에게만 갈 수 있어야 한다.
    CONSTRAINT fk_notifications_user
        FOREIGN KEY (user_id) REFERENCES users(id),

    -- 저금통 관련 알림이면 실제 존재하는 저금통이어야 한다.
    CONSTRAINT fk_notifications_jar
        FOREIGN KEY (jar_id) REFERENCES jars(jar_id),

    -- v1에서 허용하는 알림 종류만 저장되도록 DB에서도 한 번 더 막는다.
    CONSTRAINT chk_notifications_type
        CHECK (type IN (
            'NOTE_COMMENTED',
            'COMMENT_REPLIED',
            'NOTE_REACTED',
            'JAR_MEMBER_JOINED'
        )),

    -- payload_json이 완전 빈 문자열로 저장되는 실수를 한 번 막아준다.
    CONSTRAINT chk_notifications_payload_not_empty
        CHECK (CHAR_LENGTH(payload_json) > 0),

    -- 아직 안 읽은 상태면 read_at은 NULL이어야 자연스럽고, 읽은 상태면 read_at이 있어야 자연스럽다.
    CONSTRAINT chk_notifications_read_state
        CHECK (
            (is_read = FALSE AND read_at IS NULL)
            OR
            (is_read = TRUE AND read_at IS NOT NULL)
        )
);

-- 1) 내 알림 목록 조회용 인덱스
-- 사용자별 + 삭제되지 않은 알림 + 최신순 조회에 도움 된다.
CREATE INDEX idx_notifications_user_deleted_created_notification
    ON notifications(user_id, deleted_at, created_at, notification_id);

-- 2) 안 읽은 알림 개수(unread count) 조회용 인덱스
-- 헤더 벨 숫자 계산할 때 도움 된다.
CREATE INDEX idx_notifications_user_deleted_is_read_created
    ON notifications(user_id, deleted_at, is_read, created_at, notification_id);

-- 3) 저금통 기준 알림 조회/정리/디버깅 시 도움 되는 인덱스
CREATE INDEX idx_notifications_jar_id
    ON notifications(jar_id);