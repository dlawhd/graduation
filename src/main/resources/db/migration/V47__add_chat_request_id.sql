-- NULL은 기존 클라이언트와 SYSTEM 메시지용이다. 신규 전송에는 사용자별 멱등 키를 사용한다.
ALTER TABLE chat_messages ADD COLUMN client_request_id VARCHAR(64) NULL;
CREATE UNIQUE INDEX uk_chat_request ON chat_messages (jar_id, sender_id, client_request_id);
