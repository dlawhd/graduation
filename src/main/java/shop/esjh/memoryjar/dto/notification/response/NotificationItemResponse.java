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
        String emoji
) {
}