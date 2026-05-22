package shop.esjh.memoryjar.dto.notification.response;

import java.time.LocalDateTime;

public record NotificationReadAllResponse(
        int updatedCount,
        LocalDateTime readAt
) {
}