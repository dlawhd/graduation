-- V7__create_jar_invites.sql

CREATE TABLE jar_invites (
    invite_id BIGINT NOT NULL AUTO_INCREMENT,
    jar_id BIGINT NOT NULL,
    created_by BIGINT NOT NULL,
    code VARCHAR(50) NOT NULL,
    expires_at DATETIME(6) NOT NULL,
    revoked_at DATETIME(6) NULL,
    max_uses INT NOT NULL DEFAULT 1,
    used_count INT NOT NULL DEFAULT 0,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (invite_id),
    CONSTRAINT uk_jar_invites_code
        UNIQUE (code),
    CONSTRAINT fk_jar_invites_jar
        FOREIGN KEY (jar_id) REFERENCES jars(jar_id),
    CONSTRAINT fk_jar_invites_created_by
        FOREIGN KEY (created_by) REFERENCES users(id),
    CONSTRAINT chk_jar_invites_max_uses
        CHECK (max_uses > 0),
    CONSTRAINT chk_jar_invites_used_count
        CHECK (used_count >= 0),
    CONSTRAINT chk_jar_invites_used_count_le_max_uses
        CHECK (used_count <= max_uses)
);

CREATE INDEX idx_jar_invites_jar_id
    ON jar_invites(jar_id);

CREATE INDEX idx_jar_invites_created_by
    ON jar_invites(created_by);

CREATE INDEX idx_jar_invites_expires_at
    ON jar_invites(expires_at);