-- AI 실패 문의는 Draft와 별개로 사진을 보관한다. 생성 1건당 문의 1건만 허용한다.
CREATE TABLE support_inquiries (
    inquiry_id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    owner_id BIGINT NOT NULL,
    generation_id BIGINT NOT NULL,
    draft_id BIGINT NOT NULL,
    style VARCHAR(30) NOT NULL,
    error_code VARCHAR(50) NOT NULL,
    model VARCHAR(150) NOT NULL,
    prompt_version VARCHAR(100) NOT NULL,
    failed_at DATETIME(6) NOT NULL,
    description VARCHAR(1000) NOT NULL,
    reply VARCHAR(3000) NULL,
    status VARCHAR(20) NOT NULL,
    source_s3_key VARCHAR(512) NULL,
    image_s3_key VARCHAR(512) NOT NULL,
    image_deleted_at DATETIME(6) NULL,
    image_expires_at DATETIME(6) NOT NULL,
    content_expires_at DATETIME(6) NOT NULL,
    content_deleted_at DATETIME(6) NULL,
    sharing_agreed_at DATETIME(6) NOT NULL,
    replied_at DATETIME(6) NULL,
    created_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL,
    CONSTRAINT uk_support_generation UNIQUE (generation_id),
    CONSTRAINT uk_support_image UNIQUE (image_s3_key),
    CONSTRAINT fk_support_owner FOREIGN KEY (owner_id) REFERENCES users(id),
    CONSTRAINT fk_support_generation FOREIGN KEY (generation_id) REFERENCES jar_ai_generations(generation_id),
    CONSTRAINT fk_support_draft FOREIGN KEY (draft_id) REFERENCES jar_design_drafts(draft_id),
    CONSTRAINT chk_support_status CHECK (status IN ('COPYING','COPY_FAILED','OPEN','IN_PROGRESS','ANSWERED')),
    CONSTRAINT chk_support_reply CHECK ((status = 'ANSWERED' AND replied_at IS NOT NULL) OR (status <> 'ANSWERED' AND replied_at IS NULL))
);
CREATE INDEX idx_support_owner_id ON support_inquiries(owner_id, inquiry_id);
CREATE INDEX idx_support_status_id ON support_inquiries(status, inquiry_id);
CREATE INDEX idx_support_image_cleanup ON support_inquiries(image_deleted_at, image_expires_at);
CREATE INDEX idx_support_content_cleanup ON support_inquiries(content_deleted_at, content_expires_at);

-- 원문, 사진, URL은 감사 기록에 넣지 않는다.
CREATE TABLE support_inquiry_audits (
    audit_id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    inquiry_id BIGINT NOT NULL,
    actor_id BIGINT NOT NULL,
    action VARCHAR(30) NOT NULL,
    created_at DATETIME(6) NOT NULL,
    CONSTRAINT fk_support_audit_inquiry FOREIGN KEY (inquiry_id) REFERENCES support_inquiries(inquiry_id)
);
CREATE INDEX idx_support_audit_created ON support_inquiry_audits(created_at);

ALTER TABLE notifications DROP CONSTRAINT chk_notifications_type,
    ADD CONSTRAINT chk_notifications_type CHECK (type IN (
        'NOTE_COMMENTED','COMMENT_REPLIED','NOTE_REACTED','JAR_MEMBER_JOINED','SUPPORT_REPLIED'
    ));
