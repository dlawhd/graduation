package com.example.demo.dto.notification.response;

import java.time.LocalDateTime;

public record NotificationReadResponse(
        Long notificationId,
        boolean isRead,
        LocalDateTime readAt
) {
}