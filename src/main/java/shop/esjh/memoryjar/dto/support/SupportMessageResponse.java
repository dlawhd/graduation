package shop.esjh.memoryjar.dto.support;

import shop.esjh.memoryjar.entity.support.SupportMessage;
import java.time.LocalDateTime;
import java.util.List;

/** 대화에는 계정 식별자·쿠키·사진 주소를 포함하지 않고 역할과 내용만 표시한다. */
public record SupportMessageResponse(Long messageId, String role, String content, LocalDateTime createdAt) {
    public static SupportMessageResponse from(SupportMessage m) {
        return new SupportMessageResponse(m.getMessageId(), m.getAuthorRole(), m.getContent(), m.getCreatedAt());
    }
    public record MessagePage(List<SupportMessageResponse> items, Long nextBefore) { }
}
