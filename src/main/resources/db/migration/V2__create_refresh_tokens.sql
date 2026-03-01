CREATE TABLE refresh_tokens (
  token_id BIGINT NOT NULL AUTO_INCREMENT,
  member_id BIGINT NOT NULL,
  token_hash CHAR(64) NOT NULL,
  expires_at DATETIME(6) NOT NULL,
  revoked_at DATETIME(6) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (token_id),
  CONSTRAINT fk_refresh_tokens_member
    FOREIGN KEY (member_id) REFERENCES members(id)
);

CREATE UNIQUE INDEX uk_refresh_tokens_token_hash
  ON refresh_tokens(token_hash);

CREATE INDEX idx_refresh_tokens_member_id
  ON refresh_tokens(member_id);

CREATE INDEX idx_refresh_tokens_expires_at
  ON refresh_tokens(expires_at);