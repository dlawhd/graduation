CREATE TABLE operator_passkeys (
    user_id BIGINT PRIMARY KEY,
    credential_id VARCHAR(1400) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    user_handle VARBINARY(64) NOT NULL,
    public_key_cose VARBINARY(4096) NOT NULL,
    signature_count BIGINT NOT NULL,
    CONSTRAINT uq_operator_passkey_credential UNIQUE (credential_id),
    CONSTRAINT uq_operator_passkey_handle UNIQUE (user_handle),
    CONSTRAINT fk_operator_passkey_user FOREIGN KEY (user_id) REFERENCES users(id)
);

ALTER TABLE refresh_tokens
    ADD COLUMN operator_passkey_verified BOOLEAN NOT NULL DEFAULT FALSE;
