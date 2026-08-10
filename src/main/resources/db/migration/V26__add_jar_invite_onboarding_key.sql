-- V26__add_jar_invite_onboarding_key.sql
--
-- 초대 관리 화면의 이용 방법을
-- 사용자별로 저장할 수 있도록 JAR_INVITE 종류를 추가한다.

ALTER TABLE user_onboarding_progress

    -- 기존 다섯 가지 온보딩 종류만 허용하던 제약조건 제거
    DROP CONSTRAINT chk_user_onboarding_progress_tutorial_key,

    -- 초대 관리 안내인 JAR_INVITE까지 허용
    ADD CONSTRAINT chk_user_onboarding_progress_tutorial_key
        CHECK (
            tutorial_key IN (
                'WELCOME',
                'JAR_LIST',
                'JAR_CREATE',
                'JAR_DETAIL',
                'JAR_INVITE',
                'DAILY_DRAW'
            )
        );