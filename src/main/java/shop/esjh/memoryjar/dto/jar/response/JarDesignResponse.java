package shop.esjh.memoryjar.dto.jar.response;

import shop.esjh.memoryjar.enums.ai.JarDesignType;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

/**
 * 기존 Jar 화면에서 영구 커스텀 디자인을 그리는 데 필요한 공개 정보다.
 * Private S3 Key는 숨기고, 활성 멤버가 바로 사용할 수 있는 짧은 읽기 URL만 전달한다.
 */
public record JarDesignResponse(
        JarDesignType designType,
        String imageUrl,
        OffsetDateTime imageExpiresAt,
        BigDecimal slotCenterX,
        BigDecimal slotCenterY,
        BigDecimal slotSizeRatio
) {
}
