package shop.esjh.memoryjar.dto.jar.response;

import shop.esjh.memoryjar.enums.ai.JarDesignType;
import shop.esjh.memoryjar.enums.ai.JarAiStyle;
import shop.esjh.memoryjar.enums.ai.JarSlotStyle;
import shop.esjh.memoryjar.enums.ai.JarBodyStyle;
import shop.esjh.memoryjar.dto.ai.JarPhotoFrameValue;

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
        BigDecimal slotSizeRatio,
        JarAiStyle aiStyle,
        JarSlotStyle slotStyle,
        JarBodyStyle bodyStyle,
        JarPhotoFrameValue photoFrame
) {
    public JarDesignResponse(JarDesignType designType, String imageUrl, OffsetDateTime imageExpiresAt,
                             BigDecimal slotCenterX, BigDecimal slotCenterY, BigDecimal slotSizeRatio,
                             JarAiStyle aiStyle, JarSlotStyle slotStyle, JarBodyStyle bodyStyle) {
        this(designType, imageUrl, imageExpiresAt, slotCenterX, slotCenterY, slotSizeRatio, aiStyle, slotStyle, bodyStyle, null);
    }
    /** 본체 선택 이전 호출부는 기존 이미지 단독 렌더링을 유지한다. */
    public JarDesignResponse(JarDesignType designType, String imageUrl, OffsetDateTime imageExpiresAt,
                             BigDecimal slotCenterX, BigDecimal slotCenterY, BigDecimal slotSizeRatio,
                             JarAiStyle aiStyle, JarSlotStyle slotStyle) {
        this(designType, imageUrl, imageExpiresAt, slotCenterX, slotCenterY, slotSizeRatio, aiStyle, slotStyle, null);
    }

    /** 기존 호출부는 기존 둥근 투입구로 표시한다. */
    public JarDesignResponse(JarDesignType designType, String imageUrl, OffsetDateTime imageExpiresAt,
                             BigDecimal slotCenterX, BigDecimal slotCenterY, BigDecimal slotSizeRatio, JarAiStyle aiStyle) {
        this(designType, imageUrl, imageExpiresAt, slotCenterX, slotCenterY, slotSizeRatio, aiStyle, JarSlotStyle.CAPSULE);
    }
}
