package shop.esjh.memoryjar.dto.support;

import shop.esjh.memoryjar.entity.support.SupportAttachment;
import java.time.LocalDateTime;

/** 첨부 목록에는 비공개 저장 키·파일명·서명 주소를 노출하지 않는다. */
public record SupportAttachmentResponse(Long attachmentId,String status,Long bytes,LocalDateTime expiresAt) {
    public static SupportAttachmentResponse from(SupportAttachment a) {
        return new SupportAttachmentResponse(a.getAttachmentId(),a.getStatus(),a.getByteSize(),a.getExpiresAt());
    }
}
