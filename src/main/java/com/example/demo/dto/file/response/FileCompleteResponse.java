package com.example.demo.dto.file.response;

import com.example.demo.enums.file.FilePurpose;

import java.time.OffsetDateTime;

public record FileCompleteResponse(
        String s3Key,
        FilePurpose purpose,
        String publicUrl,
        String contentType,
        Long size,
        OffsetDateTime completedAt
) {
}