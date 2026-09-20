package shop.esjh.memoryjar.dto.ai.response;

import java.time.OffsetDateTime;

/** Private S3 후보 이미지를 직접 노출하지 않고, 짧은 수명의 읽기 URL만 반환한다. */
public record JarAiGenerationPreviewResponse(String previewUrl, OffsetDateTime expiresAt) {
}
