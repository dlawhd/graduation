-- V25__add_jar_create_onboarding_key.sql
--
-- 새 저금통 만들기 페이지의 이용 방법 안내를
-- 사용자별로 저장할 수 있도록 JAR_CREATE 종류를 추가한다.


ALTER TABLE user_onboarding_progress

    -- 기존 네 가지 온보딩 종류만 허용하던 제약조건 제거
    DROP CONSTRAINT chk_user_onboarding_progress_tutorial_key,

    -- 새 JAR_CREATE를 포함한 다섯 가지 종류 허용
    ADD CONSTRAINT chk_user_onboarding_progress_tutorial_key
        CHECK (
            tutorial_key IN (
                'WELCOME',
                'JAR_LIST',
                'JAR_CREATE',
                'JAR_DETAIL',
                'DAILY_DRAW'
            )
        );