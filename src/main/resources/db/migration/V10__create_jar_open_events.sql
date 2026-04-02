-- 저금통이 실제로 열렸다는 "도장"을 남기는 테이블
CREATE TABLE jar_open_events (
    event_id BIGINT NOT NULL AUTO_INCREMENT,
    jar_id BIGINT NOT NULL,
    opened_at DATETIME(6) NOT NULL,
    reason VARCHAR(30) NOT NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    deleted_at DATETIME(6) NULL,
    PRIMARY KEY (event_id),
    CONSTRAINT uk_jar_open_events_jar_id UNIQUE (jar_id),
    CONSTRAINT fk_jar_open_events_jar
        FOREIGN KEY (jar_id) REFERENCES jars(jar_id)
);

CREATE INDEX idx_jar_open_events_opened_at
    ON jar_open_events (opened_at);