package shop.esjh.memoryjar.service.ai;

import java.math.BigDecimal;
import shop.esjh.memoryjar.config.exception.ApiException;
import shop.esjh.memoryjar.enums.ai.AiDraftErrorCode;

/** 정사각형 이미지의 슬롯 크기 계약을 저장·최종화에서 동일하게 검증한다. */
public final class JarSlotGeometry {
    private static final BigDecimal MIN_WIDTH = new BigDecimal("0.12");
    private static final BigDecimal WIDTH_RANGE = new BigDecimal("0.16");
    private static final BigDecimal ASPECT_RATIO = new BigDecimal("3.5");
    private static final BigDecimal TWO = new BigDecimal("2");

    private JarSlotGeometry() { }

    /** 너비 = 이미지 너비 × (0.12 + 0.16 × ratio), 높이 = 너비 / 3.5. */
    public static void validate(BigDecimal centerX, BigDecimal centerY, BigDecimal sizeRatio) {
        validateValue(centerX);
        validateValue(centerY);
        validateValue(sizeRatio);
        BigDecimal width = MIN_WIDTH.add(WIDTH_RANGE.multiply(sizeRatio));
        // 나눗셈의 반올림 오차 없이 슬롯 양 끝이 이미지 내부인지 비교한다.
        if (centerX.multiply(TWO).compareTo(width) < 0
                || BigDecimal.ONE.subtract(centerX).multiply(TWO).compareTo(width) < 0
                || centerY.multiply(TWO).multiply(ASPECT_RATIO).compareTo(width) < 0
                || BigDecimal.ONE.subtract(centerY).multiply(TWO).multiply(ASPECT_RATIO).compareTo(width) < 0) {
            throw new ApiException(AiDraftErrorCode.DRAFT_SLOT_OUT_OF_BOUNDS);
        }
    }

    private static void validateValue(BigDecimal value) {
        if (value == null || value.scale() > 5
                || value.compareTo(BigDecimal.ZERO) < 0 || value.compareTo(BigDecimal.ONE) > 0) {
            throw new ApiException(AiDraftErrorCode.DRAFT_SLOT_INVALID);
        }
    }
}
