package shop.esjh.memoryjar.service.ai;

import shop.esjh.memoryjar.config.exception.ApiException;
import shop.esjh.memoryjar.dto.ai.JarDesignCutoutPoint;
import shop.esjh.memoryjar.enums.ai.AiDraftErrorCode;

import java.math.BigDecimal;
import java.util.List;

/**
 * 배경 제거 외곽선이 이미지 안의 유효한 정규화 좌표인지 검증한다.
 * 브라우저 검증만 믿지 않아 잘못된 좌표가 최종 이미지 처리까지 전달되는 것을 막는다.
 */
final class JarDesignCutoutGeometry {

    private static final int MIN_POINTS = 3;
    private static final int MAX_POINTS_PER_REGION = 240;
    private static final int MAX_REGIONS = 30;
    private static final int MAX_TOTAL_POINTS = 1200;
    private static final int MAX_SCALE = 5;

    private JarDesignCutoutGeometry() {
    }

    static void validate(List<JarDesignCutoutPoint> points) {
        if (points == null || points.size() < MIN_POINTS || points.size() > MAX_POINTS_PER_REGION) {
            throw new ApiException(AiDraftErrorCode.DRAFT_CUTOUT_INVALID);
        }

        for (JarDesignCutoutPoint point : points) {
            if (point == null || !isNormalized(point.x()) || !isNormalized(point.y())) {
                throw new ApiException(AiDraftErrorCode.DRAFT_CUTOUT_INVALID);
            }
        }
    }

    /** 여러 본체를 선택할 수 있게 각 영역과 전체 요청 크기를 함께 제한한다. */
    static void validateRegions(List<List<JarDesignCutoutPoint>> regions) {
        if (regions == null || regions.isEmpty() || regions.size() > MAX_REGIONS) {
            throw new ApiException(AiDraftErrorCode.DRAFT_CUTOUT_INVALID);
        }
        int totalPoints = 0;
        for (List<JarDesignCutoutPoint> region : regions) {
            validate(region);
            totalPoints += region.size();
        }
        if (totalPoints > MAX_TOTAL_POINTS) {
            throw new ApiException(AiDraftErrorCode.DRAFT_CUTOUT_INVALID);
        }
    }

    private static boolean isNormalized(BigDecimal value) {
        return value != null
                && value.scale() <= MAX_SCALE
                && value.compareTo(BigDecimal.ZERO) >= 0
                && value.compareTo(BigDecimal.ONE) <= 0;
    }
}
