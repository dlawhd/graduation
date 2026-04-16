package com.example.demo.dto.notification.response;

import com.example.demo.enums.notification.NotificationType;

import java.time.LocalDateTime;
import java.util.List;

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