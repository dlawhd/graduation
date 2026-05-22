package shop.esjh.memoryjar.dto.file.response;

import shop.esjh.memoryjar.enums.file.FilePurpose;

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