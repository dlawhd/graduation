package shop.esjh.memoryjar.dto.ai;

import jakarta.validation.constraints.*;
import java.math.BigDecimal;
import shop.esjh.memoryjar.config.exception.ApiException;
import shop.esjh.memoryjar.enums.ai.AiDraftErrorCode;
import shop.esjh.memoryjar.enums.ai.JarPhotoFit;

/** 480 정규화 원본에서 보이는 부분의 좌상단과 폭/높이(0~1)를 전송한다. */
public record JarPhotoFrameValue(
        @NotNull @DecimalMin("0") @DecimalMax("1") @Digits(integer=1, fraction=6) BigDecimal x,
        @NotNull @DecimalMin("0") @DecimalMax("1") @Digits(integer=1, fraction=6) BigDecimal y,
        @NotNull @DecimalMin("0.000001") @DecimalMax("1") @Digits(integer=1, fraction=6) BigDecimal width,
        @NotNull @DecimalMin("0.000001") @DecimalMax("1") @Digits(integer=1, fraction=6) BigDecimal height,
        JarPhotoFit fit) {
    public JarPhotoFrameValue {
        // DECIMAL 컬럼의 1.000000과 JSON의 1을 같은 편집 스냅샷으로 비교한다.
        x = canonical(x); y = canonical(y); width = canonical(width); height = canonical(height);
        // 구 프론트 요청과 V39 저장 값의 미지정 방식은 기존 꽉 채우기로 해석한다.
        fit = fit == null ? JarPhotoFit.COVER : fit;
    }
    public JarPhotoFrameValue(BigDecimal x, BigDecimal y, BigDecimal width, BigDecimal height) {
        this(x, y, width, height, JarPhotoFit.COVER);
    }
    private static BigDecimal canonical(BigDecimal value) {
        if (value == null) return null;
        BigDecimal stripped = value.stripTrailingZeros();
        return stripped.scale() < 0 ? stripped.setScale(0) : stripped;
    }
    /** 직접 Service를 호출해도 잘못된 좌표/정밀도/이미지 밖 영역은 저장하지 못한다. */
    public void validate() {
        if (!valid(x, BigDecimal.ZERO) || !valid(y, BigDecimal.ZERO)
                || !valid(width, new BigDecimal("0.000001")) || !valid(height, new BigDecimal("0.000001"))
                || x.add(width).compareTo(BigDecimal.ONE) > 0 || y.add(height).compareTo(BigDecimal.ONE) > 0)
            throw new ApiException(AiDraftErrorCode.DRAFT_PHOTO_FRAME_INVALID);
    }
    private static boolean valid(BigDecimal value, BigDecimal min) {
        return value != null && value.scale() <= 6 && value.compareTo(min) >= 0 && value.compareTo(BigDecimal.ONE) <= 0;
    }
}
