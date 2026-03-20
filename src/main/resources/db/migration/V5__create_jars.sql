-- V5__create_jars.sql

CREATE TABLE jars (
    jar_id BIGINT NOT NULL AUTO_INCREMENT,
    owner_id BIGINT NOT NULL,
    name VARCHAR(100) NOT NULL,
    description VARCHAR(255) NULL,
    theme VARCHAR(30) NOT NULL DEFAULT 'BASIC',
    max_members INT NOT NULL,
    open_at DATETIME(6) NOT NULL,
    open_mode VARCHAR(30) NOT NULL DEFAULT 'ALL_AT_ONCE',
    lock_level VARCHAR(30) NOT NULL DEFAULT 'HIDDEN',
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    deleted_at DATETIME(6) NULL,
    PRIMARY KEY (jar_id),
    CONSTRAINT fk_jars_owner
        FOREIGN KEY (owner_id) REFERENCES users(id),
    CONSTRAINT chk_jars_max_members
        CHECK (max_members > 0)
);

CREATE INDEX idx_jars_owner_id
    ON jars(owner_id);

CREATE INDEX idx_jars_open_at
    ON jars(open_at);