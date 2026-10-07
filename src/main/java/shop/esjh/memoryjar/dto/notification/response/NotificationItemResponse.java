package shop.esjh.memoryjar.dto.notification.response;

import shop.esjh.memoryjar.enums.notification.NotificationType;

import java.time.LocalDateTime;

public record NotificationItemResponse(
        Long notificationId,
        NotificationType type,
        String message,
        boolean isRead,
        LocalDateTime readAt,
        LocalDateTime createdAt,
        Long jarId,
        Long noteId,
        Long commentId,
        Long actorUserId,
        String actorName,
        String emoji,
        Long inquiryId
) {
    /** 기존 테스트/호출부와 응답 필드는 유지하고 문의 이동 번호만 선택적으로 추가한다. */
    public NotificationItemResponse(Long notificationId, NotificationType type, String message, boolean isRead,
            LocalDateTime readAt, LocalDateTime createdAt, Long jarId, Long noteId, Long commentId,
            Long actorUserId, String actorName, String emoji) {
        this(notificationId, type, message, isRead, readAt, createdAt, jarId, noteId, commentId, actorUserId, actorName, emoji, null);
    }
}
