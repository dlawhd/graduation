-- V11__create_note_attachments.sql
-- 이 테이블은 "쪽지에 붙은 첨부파일 정보"를 저장하는 테이블
-- 실제 파일 본체는 S3에 있고, DB에는 "어느 쪽지에 붙었는지", "S3 어디에 있는지", "화면에 어떤 순서로 보여줄지" 같은
-- 첨부파일의 설명서만 저장함

CREATE TABLE note_attachments (
    -- 첨부파일 하나마다 붙는 고유 번호표
    attachment_id BIGINT NOT NULL AUTO_INCREMENT,

    -- 어떤 쪽지에 속한 첨부파일인지 연결하는 값
    note_id BIGINT NOT NULL,

    -- 화면에 보여줄 순서
    -- 예:
    -- 0 = 첫 번째 사진
    -- 1 = 두 번째 사진
    -- 2 = 세 번째 사진
    -- 이렇게 저장해두면 프론트가 항상 같은 순서로 보여줄 수 있음
    sort_order INT NOT NULL DEFAULT 0,

    -- S3 안에서 파일을 찾기 위한 "진짜 내부 경로"
    -- 예: notes/10/2026/04/abc123.jpg
    -- 나중에 URL 정책이 바뀌어도 이 값이 원본 기준점
    s3_key VARCHAR(500) NOT NULL,

    -- 사용자가 실제로 접근할 파일 주소
    -- 예: CloudFront URL 또는 S3 조회용 주소
    url VARCHAR(1000) NOT NULL,

    -- 썸네일 주소
    -- 이미지/영상이면 값이 들어갈 수 있고,
    -- 일반 파일이면 없을 수 있으니 NULL 허용
    thumbnail_url VARCHAR(1000) NULL,

    -- 파일 타입
    -- 예: image/jpeg, image/png, video/mp4
    content_type VARCHAR(100) NOT NULL,

    -- 파일 크기(바이트)
    -- 음수는 말이 안 되니까 아래 CHECK로 막아둠
    size BIGINT NOT NULL,

    -- 공통 BaseEntity 규칙 맞추기
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    deleted_at DATETIME(6) NULL,

    PRIMARY KEY (attachment_id),

    -- 같은 S3 경로가 중복 저장되지 않게 막아줌
    -- 같은 파일을 같은 key로 두 번 저장하는 실수를 방지함
    CONSTRAINT uk_note_attachments_s3_key UNIQUE (s3_key),

    -- 같은 쪽지 안에서 같은 순서 번호가 중복되지 않게 막아줌
    -- 예를 들어 note_id=3 에서 sort_order=0 이 2개 생기면 안 되니까 방지하는 거야.
    CONSTRAINT uk_note_attachments_note_sort_order UNIQUE (note_id, sort_order),

    -- 첨부파일은 반드시 어떤 쪽지에 속해야 함
    CONSTRAINT fk_note_attachments_note
        FOREIGN KEY (note_id) REFERENCES notes(note_id),

    -- 파일 크기는 0 이상만 허용
    CONSTRAINT chk_note_attachments_size
        CHECK (size >= 0),

    -- 정렬 순서도 0 이상만 허용
    CONSTRAINT chk_note_attachments_sort_order
        CHECK (sort_order >= 0)
);

-- 특정 쪽지의 첨부파일 목록 조회를 빠르게 해줌
CREATE INDEX idx_note_attachments_note_id
    ON note_attachments(note_id);

-- 삭제되지 않은 첨부파일을 쪽지별 + 순서대로 조회할 때 도움 되는 인덱스
-- 상세 화면에서 가장 많이 쓰게 될 가능성이 높음
CREATE INDEX idx_note_attachments_note_id_deleted_at_sort_order
    ON note_attachments(note_id, deleted_at, sort_order);

-- 파일 종류별 분기 조회할 때 도움 될 수 있음
-- 예: 이미지 첨부만 따로 보기
CREATE INDEX idx_note_attachments_content_type
    ON note_attachments(content_type);