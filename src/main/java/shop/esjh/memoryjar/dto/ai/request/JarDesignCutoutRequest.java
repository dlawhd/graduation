package shop.esjh.memoryjar.dto.ai.request;

import jakarta.validation.Valid;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Size;
import shop.esjh.memoryjar.dto.ai.JarDesignCutoutPoint;
import shop.esjh.memoryjar.enums.ai.JarDraftDesignType;

import java.util.List;

/**
 * 사용자가 선택한 여러 닫힌 영역의 정규화 좌표를 저장한다.
 * points는 기존 단일 영역 클라이언트와의 호환용이고, 새 화면은 regions를 사용한다.
 */
public record JarDesignCutoutRequest(
        @Size(max = 240) List<@Valid JarDesignCutoutPoint> points,
        @Size(max = 30) List<@Size(min = 3, max = 240) List<@Valid JarDesignCutoutPoint>> regions,
        JarDraftDesignType expectedDesignType,
        Long expectedGenerationId
) {
    /** points 또는 regions 중 하나는 명시되어야 빈 JSON이 배경 유지 요청으로 오인되지 않는다. */
    @AssertTrue(message = "points 또는 regions가 필요합니다.")
    public boolean isSelectionPayloadPresent() {
        return points != null || regions != null;
    }

    /** 새 regions가 있으면 우선하고, 없으면 기존 points를 하나의 영역으로 변환한다. */
    public List<List<JarDesignCutoutPoint>> effectiveRegions() {
        if (regions != null) {
            return regions;
        }
        if (points == null || points.isEmpty()) {
            return List.of();
        }
        return List.of(points);
    }
}
