package com.example.demo.dto.notification.response;

import java.util.List;

public record NotificationListResponse(
        List<NotificationItemResponse> items,
        int page,
        int size,
        long totalElements,
        int totalPages
) {
}
