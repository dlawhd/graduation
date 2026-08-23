-- V29__allow_kakao_oauth_provider.sql
--
-- 역할:
--
-- Memory Jar의 OAuth 로그인 Provider에
-- KAKAO를 추가하기 위한 DB 마이그레이션이다.
--
-- 기존 V27에서 user_oauth_accounts 테이블을 만들 때
-- NAVER / GOOGLE만 저장할 수 있도록 CHECK 제약을 걸어두었다.
--
-- 이제 Kakao 로그인을 지원하므로
-- 기존 CHECK 제약을 제거한 뒤
-- NAVER / GOOGLE / KAKAO 세 가지 Provider를
-- 저장할 수 있도록 다시 만든다.
--
-- 중요한 점:
--
-- 이미 실행된 V27 파일을 직접 수정하지 않는다.
--
-- 기존 Flyway Migration을 수정하면
-- 운영 DB에 기록된 checksum과 달라질 수 있기 때문에
-- 새로운 V29 Migration으로 변경 이력을 추가한다.


-- =========================================================
-- 1. 기존 OAuth Provider CHECK 제약 제거
-- =========================================================
--
-- V27에서 생성된 기존 제약:
--
-- provider IN (
--     'NAVER',
--     'GOOGLE'
-- )
--
-- 이 상태에서는 KAKAO 값을 저장할 수 없기 때문에
-- 먼저 기존 CHECK 제약을 제거한다.

ALTER TABLE user_oauth_accounts
    DROP CONSTRAINT chk_user_oauth_accounts_provider;


-- =========================================================
-- 2. KAKAO까지 허용하는 CHECK 제약 다시 생성
-- =========================================================
--
-- 이제 Memory Jar에서 지원하는 OAuth Provider:
--
-- NAVER
-- GOOGLE
-- KAKAO
--
-- 잘못된 Provider 문자열이 DB에 들어오는 것을
-- 애플리케이션 코드뿐 아니라 DB에서도 한 번 더 막는다.

ALTER TABLE user_oauth_accounts
    ADD CONSTRAINT chk_user_oauth_accounts_provider
        CHECK (
            provider IN (
                'NAVER',
                'GOOGLE',
                'KAKAO'
            )
        );