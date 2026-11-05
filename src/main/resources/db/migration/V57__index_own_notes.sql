-- 본인 쪽지의 목록·개수 조회는 다른 작성자의 행을 먼저 훑지 않도록 같은 조건의 인덱스를 사용한다.
CREATE INDEX idx_notes_jar_author_deleted_created ON notes (jar_id, author_id, deleted_at, created_at, note_id);
