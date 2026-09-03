-- V31__allow_login_id_recovery_email_verification.sql
--
-- 역할:
--
-- 기존 email_verifications 테이블에서
-- "아이디 찾기"용 이메일 인증도 저장할 수 있도록
-- 인증 목적 CHECK 제약조건을 확장한다.
--
-- 기존:
--
-- SIGNUP
-- PASSWORD_RESET
--
-- 변경 후:
--
-- SIGNUP
-- LOGIN_ID_RECOVERY
-- PASSWORD_RESET


/*
 * 기존 V30 CHECK 제약조건을 제거한다.
 *
 * 기존 제약조건은 LOGIN_ID_RECOVERY를 모르기 때문에
 * Enum만 추가하면 MariaDB가 INSERT를 거절한다.
 */
ALTER TABLE email_verifications
    DROP CONSTRAINT chk_email_verifications_purpose;


/*
 * 아이디 찾기 목적까지 포함해서
 * CHECK 제약조건을 다시 만든다.
 */
ALTER TABLE email_verifications
    ADD CONSTRAINT chk_email_verifications_purpose
        CHECK (
            purpose IN (
                'SIGNUP',
                'LOGIN_ID_RECOVERY',
                'PASSWORD_RESET'
            )
        );