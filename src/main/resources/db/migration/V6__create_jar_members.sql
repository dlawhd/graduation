-- V6__create_jar_members.sql

CREATE TABLE jar_members (
    jar_member_id BIGINT NOT NULL AUTO_INCREMENT,
    jar_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    role VARCHAR(20) NOT NULL,
    joined_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    left_at DATETIME(6) NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    deleted_at DATETIME(6) NULL,
    PRIMARY KEY (jar_member_id),
    CONSTRAINT uk_jar_members_jar_id_user_id
        UNIQUE (jar_id, user_id),
    CONSTRAINT fk_jar_members_jar
        FOREIGN KEY (jar_id) REFERENCES jars(jar_id),
    CONSTRAINT fk_jar_members_user
        FOREIGN KEY (user_id) REFERENCES users(id),
    CONSTRAINT chk_jar_members_role
        CHECK (role IN ('OWNER', 'ADMIN', 'MEMBER'))
);

CREATE INDEX idx_jar_members_user_id
    ON jar_members(user_id);

CREATE INDEX idx_jar_members_jar_id_deleted_at
    ON jar_members(jar_id, deleted_at);