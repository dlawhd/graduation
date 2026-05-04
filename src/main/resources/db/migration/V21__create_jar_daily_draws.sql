-- V21__create_jar_daily_draws.sql
-- 이번 V21에서 만드는 것
-- 1) jar_daily_draws : 저금통별로 "오늘의 추억 한 장" 뽑기 결과를 저장하는 테이블
--
-- 이 테이블이 필요한 이유
-- - Daily Draw는 오픈된 저금통에서 하루에 쪽지 1장을 랜덤으로 보여주는 기능이다.
-- - 같은 저금통에서 같은 날짜에 카드가 2장 이상 뽑히면 안 된다.
-- - 그래서 DB에서 UNIQUE (jar_id, draw_date) 제약으로 중복을 확실하게 막는다.
--
-- 쉽게 말하면:
-- - jar_id = 어느 저금통인지
-- - note_id = 오늘 뽑힌 쪽지가 무엇인지
-- - draw_date = 어느 날짜의 오늘 카드인지
-- 를 저장하는 "오늘 카드 결과표"다.

CREATE TABLE jar_daily_draws (
    -- 오늘의 추억 한 장 기록마다 붙는 고유 번호표
    draw_id BIGINT NOT NULL AUTO_INCREMENT,

    -- 어느 저금통에서 뽑힌 카드인지 저장
    jar_id BIGINT NOT NULL,

    -- 오늘 뽑힌 쪽지가 어떤 쪽지인지 저장
    note_id BIGINT NOT NULL,

    -- 어느 날짜의 뽑기 결과인지 저장
    -- 예: 2026-05-04
    draw_date DATE NOT NULL,

    -- BaseEntity 규칙에 맞춘 공통 시간 컬럼
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    deleted_at DATETIME(6) NULL,

    -- 기본키
    PRIMARY KEY (draw_id),

    -- 같은 저금통은 같은 날짜에 딱 1장만 뽑힐 수 있다.
    -- 사용자가 버튼을 여러 번 누르거나, 두 명이 동시에 눌러도 DB가 마지막으로 막아준다.
    CONSTRAINT uq_jar_daily_draws_jar_date UNIQUE (jar_id, draw_date),

    -- 같은 저금통에서 이미 뽑힌 쪽지는 다시 뽑힐 수 없다.
    CONSTRAINT uq_jar_daily_draws_jar_note UNIQUE (jar_id, note_id),

    -- 실제 존재하는 저금통에 대해서만 Daily Draw 기록을 만들 수 있다.
    CONSTRAINT fk_jar_daily_draws_jar
        FOREIGN KEY (jar_id) REFERENCES jars(jar_id),

    -- 실제 존재하는 쪽지만 오늘의 카드로 뽑힐 수 있다.
    CONSTRAINT fk_jar_daily_draws_note
        FOREIGN KEY (note_id) REFERENCES notes(note_id)
);

-- 저금통별 히스토리 조회용 인덱스
-- 예:
-- SELECT *
-- FROM jar_daily_draws
-- WHERE jar_id = ? AND deleted_at IS NULL
-- ORDER BY draw_date DESC;
CREATE INDEX idx_jar_daily_draws_jar_deleted_date
    ON jar_daily_draws(jar_id, deleted_at, draw_date);

-- 특정 쪽지가 Daily Draw에 뽑힌 적 있는지 확인할 때 도움 되는 인덱스
CREATE INDEX idx_jar_daily_draws_note_id
    ON jar_daily_draws(note_id);