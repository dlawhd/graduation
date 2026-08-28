-- V30__create_local_auth_and_email_verifications.sql
--
-- 역할:
--
-- Memory Jar 자체 회원가입/로그인을 위한 DB 구조를 만든다.
--
-- 이번 V30에서 하는 일은 총 3가지다.
--
-- 1. users.provider / provider_id를 NULL 허용으로 변경
-- 2. 아이디 + 비밀번호 로그인 정보를 저장하는
--    user_local_credentials 테이블 생성
-- 3. 회원가입/비밀번호 찾기에 사용할
--    email_verifications 테이블 생성
--
--
-- 최종 구조:
--
-- users
-- ├─ 실제 Memory Jar 사용자
-- │
-- ├─ user_local_credentials
-- │   └─ Memory Jar 아이디 + 비밀번호
-- │
-- └─ user_oauth_accounts
--     ├─ NAVER
--     ├─ GOOGLE
--     └─ KAKAO
--
-- 즉,
--
-- User = 사람
-- LocalCredential / OAuthAccount = 로그인 방법
--
-- 으로 역할을 분리한다.


-- =========================================================
-- 1. users의 기존 OAuth 컬럼을 NULL 허용으로 변경
-- =========================================================
--
-- 현재 V29까지의 users 테이블에는
--
-- provider
-- provider_id
--
-- 가 NOT NULL로 되어 있다.
--
-- 기존 NAVER / GOOGLE / KAKAO 회원은
-- 이 컬럼에 값이 들어 있지만,
--
-- 앞으로 만들어질 LOCAL 회원은
-- OAuth Provider 자체가 없기 때문에
--
-- provider = NULL
-- provider_id = NULL
--
-- 상태가 자연스럽다.
--
-- 기존 OAuth 회원의 데이터는 삭제하거나 변경하지 않는다.
-- 단순히 "NULL도 저장할 수 있게" 제약만 완화한다.

ALTER TABLE users
    MODIFY COLUMN provider VARCHAR(20) NULL,
    MODIFY COLUMN provider_id VARCHAR(100) NULL;


-- =========================================================
-- 2. user_local_credentials
-- =========================================================
--
-- 역할:
--
-- Memory Jar 자체 로그인용
-- "아이디 + 비밀번호"를 저장한다.
--
-- 쉽게 생각하면:
--
-- users
-- id = 10
-- name = 은서
--
-- user_local_credentials
-- user_id = 10
-- login_id = eunseo01
-- password_hash = 암호화된 비밀번호
--
-- 이렇게 한 사람(User)에게
-- LOCAL 로그인 열쇠 하나를 연결하는 구조다.

CREATE TABLE user_local_credentials (

    -- LOCAL 로그인 정보 하나마다 붙는 고유 번호
    local_credential_id BIGINT NOT NULL AUTO_INCREMENT,

    -- 이 로그인 정보가 어느 Memory Jar 사용자 것인지 연결
    user_id BIGINT NOT NULL,

    -- 사용자가 로그인 화면에서 입력할 아이디
    --
    -- 예:
    -- eunseo01
    -- memory_jar
    --
    -- 로그인할 때 이메일 대신 이 값을 사용한다.
    login_id VARCHAR(20) NOT NULL,

    -- 사용자가 입력한 비밀번호 원문을 저장하면 안 된다.
    --
    -- 예:
    -- Memory1234   ← 저장하면 안 됨
    --
    -- PasswordEncoder를 거친 Hash 값만 저장한다.
    --
    -- Argon2 / BCrypt 등 다양한 Hash 길이를
    -- 안전하게 담을 수 있도록 VARCHAR(255)를 사용한다.
    password_hash VARCHAR(255) NOT NULL,

    -- 비밀번호가 마지막으로 변경된 시간
    --
    -- 나중에 비밀번호 재설정 기능을 만들 때도 사용할 수 있다.
    password_changed_at DATETIME(6) NOT NULL
        DEFAULT CURRENT_TIMESTAMP(6),

    -- BaseEntity 공통 시간 컬럼
    created_at DATETIME(6) NOT NULL
        DEFAULT CURRENT_TIMESTAMP(6),

    updated_at DATETIME(6) NOT NULL
        DEFAULT CURRENT_TIMESTAMP(6)
        ON UPDATE CURRENT_TIMESTAMP(6),

    deleted_at DATETIME(6) NULL,

    -- 기본키
    PRIMARY KEY (local_credential_id),

    -- 한 사용자는 LOCAL 로그인 정보를 하나만 가진다.
    --
    -- user 1 → eunseo01
    -- user 1 → eunseo02
    --
    -- 같은 사용자가 이런 식으로
    -- LOCAL 계정을 두 개 만드는 것을 DB에서 막는다.
    CONSTRAINT uk_user_local_credentials_user
        UNIQUE (user_id),

    -- 로그인 아이디는 서비스 전체에서 중복되면 안 된다.
    --
    -- eunseo01이라는 아이디가 이미 존재하면
    -- 다른 사용자는 같은 아이디를 만들 수 없다.
    CONSTRAINT uk_user_local_credentials_login_id
        UNIQUE (login_id),

    -- 실제 존재하는 사용자에게만
    -- LOCAL 로그인 정보를 연결할 수 있다.
    CONSTRAINT fk_user_local_credentials_user
        FOREIGN KEY (user_id)
        REFERENCES users(id),

    -- 우리가 정한 아이디 규칙을 DB에서도 한 번 더 검사한다.
    --
    -- 허용:
    -- eunseo
    -- eunseo01
    -- eunseo_01
    --
    -- 조건:
    -- - 4~20자
    -- - 영문 소문자
    -- - 숫자
    -- - _
    --
    -- 프론트/백엔드에서도 다시 검증하지만
    -- DB가 마지막 안전장치 역할을 한다.
    CONSTRAINT chk_user_local_credentials_login_id
        CHECK (
            login_id REGEXP '^[a-z0-9_]{4,20}$'
        ),

    -- 실수로 빈 password_hash가 저장되는 것을 막는다.
    CONSTRAINT chk_user_local_credentials_password_hash
        CHECK (
            CHAR_LENGTH(TRIM(password_hash)) > 0
        )
);


-- =========================================================
-- 3. email_verifications
-- =========================================================
--
-- 역할:
--
-- 회원가입이나 비밀번호 재설정을 할 때
-- 사용자가 입력한 이메일이 실제 본인의 이메일인지
-- 확인하기 위한 인증 상태를 저장한다.
--
-- 예:
--
-- eunseo@naver.com
--      ↓
-- 인증번호 482193 발송
--      ↓
-- 사용자가 482193 입력
--      ↓
-- 인증 성공
--
--
-- 중요한 점:
--
-- 이 테이블에는 아직 user_id가 없다.
--
-- 왜냐하면 회원가입 이메일 인증을 하는 순간에는
-- 아직 users 테이블에 사용자가 만들어지지 않았기 때문이다.

CREATE TABLE email_verifications (

    -- 이메일 인증 요청 하나의 고유 번호
    verification_id BIGINT NOT NULL AUTO_INCREMENT,

    -- 인증번호를 받을 이메일
    email VARCHAR(255) NOT NULL,

    -- 이 이메일 인증을 어디에 사용하는지 구분한다.
    --
    -- SIGNUP
    -- = 회원가입
    --
    -- PASSWORD_RESET
    -- = 나중에 만들 비밀번호 재설정
    --
    -- 아직 비밀번호 찾기를 구현하지 않더라도
    -- 처음부터 목적을 분리해두면
    -- 나중에 테이블 구조를 다시 바꿀 필요가 없다.
    purpose VARCHAR(30) NOT NULL,

    -- 사용자가 실제로 받은 6자리 인증번호를
    -- DB에 그대로 저장하지 않는다.
    --
    -- 예:
    --
    -- 실제 인증번호:
    -- 482193
    --
    -- DB:
    -- 92ab83c...
    --
    -- 나중에 서버에서 HMAC-SHA256 방식으로
    -- 인증번호를 안전하게 Hash해서 저장할 예정이다.
    --
    -- SHA-256 결과는 16진수 64글자이므로 CHAR(64)를 사용한다.
    code_hash CHAR(64) NOT NULL,

    -- 입력 가능한 인증번호의 만료 시간
    --
    -- 우리가 정한 정책:
    -- 인증번호 유효시간 약 5분
    code_expires_at DATETIME(6) NOT NULL,

    -- 사용자가 인증번호를 정확하게 입력해서
    -- 이메일 인증에 성공한 시간
    --
    -- 아직 성공하지 않았다면 NULL
    verified_at DATETIME(6) NULL,

    -- 이메일 인증 성공 후 서버가 발급하는
    -- 내부용 인증 완료 토큰의 Hash
    --
    -- 이 값은 사용자가 직접 보는 값이 아니다.
    --
    -- 화면에서는 단순히:
    --
    -- ✓ 이메일 인증이 완료되었어요.
    --
    -- 라고 보이지만,
    -- 서버 내부에서는 이 토큰을 이용해
    -- "진짜 인증을 완료했던 요청인지" 한 번 더 확인한다.
    verification_token_hash CHAR(64) NULL,

    -- 인증 성공 상태를 최종 회원가입에서
    -- 언제까지 사용할 수 있는지 저장한다.
    --
    -- 예:
    -- 이메일 인증 완료 후 10~15분 정도
    --
    -- 정확한 시간은 Service 구현 단계에서 결정한다.
    verification_expires_at DATETIME(6) NULL,

    -- 이메일 인증 결과를 실제 회원가입이나
    -- 비밀번호 재설정에서 이미 사용했는지 기록한다.
    --
    -- 한 번 사용한 인증 결과를
    -- 다시 재사용하는 것을 막기 위한 컬럼이다.
    consumed_at DATETIME(6) NULL,

    -- 인증번호를 틀린 횟수
    --
    -- 예:
    -- 123456 → 실패
    -- 111111 → 실패
    --
    -- 이런 시도를 계속 허용하지 않고
    -- 일정 횟수 이후 막기 위해 사용한다.
    attempt_count INT NOT NULL DEFAULT 0,

    -- 마지막으로 인증메일을 발송한 시간
    --
    -- "60초 후 다시 보내기" 기능을 만들 때 사용한다.
    last_sent_at DATETIME(6) NOT NULL
        DEFAULT CURRENT_TIMESTAMP(6),

    -- 생성/수정 시간
    created_at DATETIME(6) NOT NULL
        DEFAULT CURRENT_TIMESTAMP(6),

    updated_at DATETIME(6) NOT NULL
        DEFAULT CURRENT_TIMESTAMP(6)
        ON UPDATE CURRENT_TIMESTAMP(6),

    PRIMARY KEY (verification_id),

    -- 같은 이메일이라도 목적이 다르면
    -- 각각 인증 상태를 가질 수 있다.
    --
    -- 가능:
    --
    -- eunseo@naver.com + SIGNUP
    -- eunseo@naver.com + PASSWORD_RESET
    --
    -- 하지만:
    --
    -- eunseo@naver.com + SIGNUP
    -- eunseo@naver.com + SIGNUP
    --
    -- 같은 목적의 인증 정보는 하나만 관리한다.
    --
    -- 인증번호를 재전송할 때는
    -- row를 계속 새로 만들지 않고
    -- 기존 row를 갱신하는 방식으로 갈 예정이다.
    CONSTRAINT uk_email_verifications_email_purpose
        UNIQUE (email, purpose),

    -- 현재 지원하는 이메일 인증 목적만 허용
    CONSTRAINT chk_email_verifications_purpose
        CHECK (
            purpose IN (
                'SIGNUP',
                'PASSWORD_RESET'
            )
        ),

    -- 이메일이 빈 문자열로 저장되는 실수를 막는다.
    CONSTRAINT chk_email_verifications_email_not_empty
        CHECK (
            CHAR_LENGTH(TRIM(email)) > 0
        ),

    -- 실패 횟수가 음수가 될 수는 없다.
    CONSTRAINT chk_email_verifications_attempt_count
        CHECK (
            attempt_count >= 0
        ),

    -- 인증 전에는
    --
    -- verified_at
    -- verification_token_hash
    -- verification_expires_at
    --
    -- 세 값이 모두 NULL이어야 한다.
    --
    -- 인증이 성공하면 세 값이 모두 있어야 한다.
    CONSTRAINT chk_email_verifications_verified_state
        CHECK (
            (
                verified_at IS NULL
                AND verification_token_hash IS NULL
                AND verification_expires_at IS NULL
            )
            OR
            (
                verified_at IS NOT NULL
                AND verification_token_hash IS NOT NULL
                AND verification_expires_at IS NOT NULL
            )
        ),

    -- consumed_at이 있다는 것은
    -- 이미 인증에 성공했던 기록이라는 뜻이다.
    CONSTRAINT chk_email_verifications_consumed_state
        CHECK (
            consumed_at IS NULL
            OR verified_at IS NOT NULL
        )
);


-- =========================================================
-- 4. 이메일 인증 만료 데이터 정리용 인덱스
-- =========================================================
--
-- 나중에 오래된 인증번호를 정리할 때:
--
-- WHERE code_expires_at < NOW()
--
-- 같은 조회를 빠르게 하기 위한 인덱스다.

CREATE INDEX idx_email_verifications_code_expires_at
    ON email_verifications(code_expires_at);


-- 인증 성공 후 사용 가능 시간이 지난 데이터를
-- 정리할 때 사용할 수 있다.
CREATE INDEX idx_email_verifications_verification_expires_at
    ON email_verifications(verification_expires_at);