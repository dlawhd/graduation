-- V24__create_user_onboarding_progress.sql
--
-- 사용자별 온보딩 진행 상태를 저장하는 테이블
--
-- 쉽게 말하면:
-- "이 사용자가 어떤 이용 방법 안내를 완료하거나 건너뛰었는지"
-- 기록하는 출석부 역할을 한다.
--
-- 현재 온보딩 종류
-- 1. WELCOME    : Memory Jar 전체 소개
-- 2. JAR_LIST   : 새 저금통 만들기 안내
-- 3. JAR_DETAIL : 쪽지, 초대, 채팅 안내
-- 4. DAILY_DRAW : 오늘의 추억 한 장 안내

CREATE TABLE user_onboarding_progress (

    -- 온보딩 기록 하나마다 붙는 고유 번호표
    onboarding_progress_id BIGINT NOT NULL AUTO_INCREMENT,

    -- 어떤 사용자의 기록인지 저장
    user_id BIGINT NOT NULL,

    -- 어떤 온보딩 안내인지 저장
    tutorial_key VARCHAR(30) NOT NULL,

    -- 온보딩 내용의 버전
    -- 나중에 안내 화면이 크게 바뀌면 1에서 2로 올릴 수 있다.
    tutorial_version INT NOT NULL,

    -- 사용자가 안내를 끝까지 봤는지 또는 건너뛰었는지 저장
    status VARCHAR(20) NOT NULL,

    -- 완료 또는 건너뛰기로 온보딩 흐름이 끝난 시간
    finished_at DATETIME(6) NOT NULL,

    -- BaseEntity 공통 시간 컬럼
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
        ON UPDATE CURRENT_TIMESTAMP(6),
    deleted_at DATETIME(6) NULL,

    PRIMARY KEY (onboarding_progress_id),

    -- 동일 사용자가 같은 버전의 같은 온보딩 기록을
    -- 여러 개 만들지 못하도록 막는다.
    CONSTRAINT uq_user_onboarding_progress_user_key_version
        UNIQUE (user_id, tutorial_key, tutorial_version),

    -- 실제 존재하는 사용자만 온보딩 기록을 가질 수 있다.
    CONSTRAINT fk_user_onboarding_progress_user
        FOREIGN KEY (user_id) REFERENCES users(id),

    -- 1 이상의 버전만 저장한다.
    CONSTRAINT chk_user_onboarding_progress_version
        CHECK (tutorial_version >= 1),

    -- 현재 서비스에서 사용하는 온보딩 종류만 허용한다.
    CONSTRAINT chk_user_onboarding_progress_tutorial_key
        CHECK (
            tutorial_key IN (
                'WELCOME',
                'JAR_LIST',
                'JAR_DETAIL',
                'DAILY_DRAW'
            )
        ),

    -- 완료와 건너뛰기만 저장한다.
    CONSTRAINT chk_user_onboarding_progress_status
        CHECK (status IN ('COMPLETED', 'SKIPPED'))
);

-- 로그인 후 현재 버전의 온보딩 상태를 조회할 때 사용하는 인덱스
CREATE INDEX idx_user_onboarding_progress_user_version_deleted
    ON user_onboarding_progress(
        user_id,
        tutorial_version,
        deleted_at
    );