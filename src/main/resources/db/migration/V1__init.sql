CREATE TABLE members (
  id BIGINT NOT NULL AUTO_INCREMENT,
  email VARCHAR(255) NULL,
  name VARCHAR(50) NULL,
  birthyear VARCHAR(10) NULL,
  provider VARCHAR(20) NOT NULL,
  provider_id VARCHAR(100) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  CONSTRAINT uk_members_email UNIQUE (email),
  CONSTRAINT uk_members_provider_provider_id UNIQUE (provider, provider_id)
);