-- V27__create_user_oauth_accounts.sql
--
-- 한 명의 Memory Jar 사용자가
-- 여러 OAuth 로그인 수단을 사용할 수 있도록
-- OAuth 계정 정보를 별도 테이블로 분리한다.
--
-- 쉽게 말하면:
--
-- users
-- └─ Memory Jar에서의 "한 사람"
--
-- user_oauth_accounts
-- └─ 그 사람이 사용할 수 있는 로그인 열쇠
--
-- 예:
--
-- user_id = 1
--   ├─ NAVER  / naver-123
--   └─ GOOGLE / google-sub-456
--
-- 기존 users.provider / provider_id 컬럼은
-- 현재 코드 및 테스트와의 호환성을 위해 당장은 유지한다.
--
-- 앞으로 실제 OAuth 로그인 계정 연결의 기준은
-- user_oauth_accounts 테이블이 담당한다.


-- =========================================================
-- 1. OAuth 계정 연결 테이블 생성
-- =========================================================

CREATE TABLE user_oauth_accounts (

    -- OAuth 계정 연결 정보 하나마다 붙는 고유 번호표
    oauth_account_id BIGINT NOT NULL AUTO_INCREMENT,

    -- 이 OAuth 계정이 어느 Memory Jar 사용자에게 연결되는지 저장
    user_id BIGINT NOT NULL,

    -- 어떤 OAuth 로그인 서비스인지 저장
    --
    -- 현재:
    -- NAVER
    -- GOOGLE
    provider VARCHAR(20) NOT NULL,

    -- 각 OAuth 서비스가 사용자에게 부여한 고유 ID
    --
    -- NAVER  -> 네이버 응답의 id
    -- GOOGLE -> Google OpenID Connect 응답의 sub
    provider_id VARCHAR(100) NOT NULL,

    -- BaseEntity 공통 시간 컬럼
    created_at DATETIME(6) NOT NULL
        DEFAULT CURRENT_TIMESTAMP(6),

    updated_at DATETIME(6) NOT NULL
        DEFAULT CURRENT_TIMESTAMP(6)
        ON UPDATE CURRENT_TIMESTAMP(6),

    deleted_at DATETIME(6) NULL,

    -- OAuth 계정 연결 row의 기본키
    PRIMARY KEY (oauth_account_id),

    -- 같은 OAuth 계정이 서로 다른 Memory Jar 사용자에게
    -- 두 번 연결되는 것을 DB에서 막는다.
    -- 예:
    -- GOOGLE + google-123
    -- 이 조합은 테이블 전체에서 한 번만 존재할 수 있다.
    CONSTRAINT uk_user_oauth_accounts_provider_provider_id
        UNIQUE (provider, provider_id),


     -- 한 Memory Jar 사용자가
     -- 같은 Provider 계정을 여러 개 연결하는 것을 막는다.
     -- 가능:
     -- user 1 + NAVER
     -- user 1 + GOOGLE
     -- 불가능:
     -- user 1 + GOOGLE + google-A
     -- user 1 + GOOGLE + google-B
    CONSTRAINT uk_user_oauth_accounts_user_provider
        UNIQUE (user_id, provider),

    -- 반드시 실제 존재하는 Memory Jar 사용자에게만
    -- OAuth 로그인 계정을 연결할 수 있다.
    CONSTRAINT fk_user_oauth_accounts_user
        FOREIGN KEY (user_id)
        REFERENCES users(id),

    -- 현재 서비스에서 지원하는 OAuth Provider만 저장한다.
    CONSTRAINT chk_user_oauth_accounts_provider
        CHECK (
            provider IN (
                'NAVER',
                'GOOGLE'
            )
        )
);

-- =========================================================
-- 2. 기존 NAVER 사용자 OAuth 정보 이전
-- =========================================================
--
-- 현재 운영 DB의 기존 사용자들은
-- users 테이블 안에 provider와 provider_id를 가지고 있다.
--
-- 예:
--
-- users
--
-- id | provider | provider_id
-- 1  | NAVER    | naver-123
--
-- 새 테이블만 만들고 끝내면 기존 사용자의
-- OAuth 연결 정보가 user_oauth_accounts에는 없게 된다.
--
-- 그래서 V27 실행 시 기존 사용자 정보를
-- 새로운 OAuth 연결 테이블에도 자동으로 복사한다.
--
-- 이 작업을 backfill이라고 한다.
-- backfill(기존 데이터를 새 구조에 맞게 미리 채워주는 작업)

INSERT INTO user_oauth_accounts (
    user_id,
    provider,
    provider_id,
    created_at,
    updated_at,
    deleted_at
)
SELECT
    id,
    UPPER(provider),
    provider_id,

    -- 기존 사용자가 가입한 시간을
    -- OAuth 연결 생성 시간으로 그대로 이어받는다.
    created_at,

    -- 기존 사용자의 마지막 수정 시간도 이어받는다.
    updated_at,

    -- 현재 활성 사용자만 아래 WHERE에서 복사하므로
    -- 삭제 시간은 NULL로 저장한다.
    NULL
FROM users
WHERE deleted_at IS NULL
  AND provider IS NOT NULL
  AND provider_id IS NOT NULL
  AND UPPER(provider) IN (
      'NAVER',
      'GOOGLE'
  );