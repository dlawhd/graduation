-- 1) refresh_tokens가 members를 보고 있는 FK 먼저 제거
ALTER TABLE refresh_tokens
    DROP FOREIGN KEY fk_refresh_tokens_member;

-- 2) member_id 인덱스도 이름이 바뀔 거라 먼저 제거
DROP INDEX idx_refresh_tokens_member_id ON refresh_tokens;

-- 3) 부모 테이블 이름 변경
RENAME TABLE members TO users;

-- 4) users 테이블의 unique 이름도 users 기준으로 다시 정리
ALTER TABLE users
    DROP INDEX uk_members_email,
    ADD CONSTRAINT uk_users_email UNIQUE (email),
    DROP INDEX uk_members_provider_provider_id,
    ADD CONSTRAINT uk_users_provider_provider_id UNIQUE (provider, provider_id);

-- 5) 자식 테이블 컬럼명 변경
ALTER TABLE refresh_tokens
    CHANGE COLUMN member_id user_id BIGINT NOT NULL;

-- 6) 새 컬럼명 기준 인덱스 생성
CREATE INDEX idx_refresh_tokens_user_id
    ON refresh_tokens(user_id);

-- 7) 새 FK 다시 연결
ALTER TABLE refresh_tokens
    ADD CONSTRAINT fk_refresh_tokens_user
        FOREIGN KEY (user_id) REFERENCES users(id);