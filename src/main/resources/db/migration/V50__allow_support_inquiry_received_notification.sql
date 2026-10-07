-- 기존 알림과 답변 알림을 보존하면서 운영자용 새 문의 접수 알림만 허용한다.
ALTER TABLE notifications DROP CONSTRAINT chk_notifications_type,
    ADD CONSTRAINT chk_notifications_type CHECK (type IN (
        'NOTE_COMMENTED','COMMENT_REPLIED','NOTE_REACTED','JAR_MEMBER_JOINED',
        'SUPPORT_REPLIED','SUPPORT_INQUIRY_RECEIVED'
    ));
