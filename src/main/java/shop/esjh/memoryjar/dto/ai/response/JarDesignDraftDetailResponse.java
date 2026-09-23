package shop.esjh.memoryjar.dto.ai.response;

import shop.esjh.memoryjar.enums.ai.*;
import shop.esjh.memoryjar.dto.ai.JarDesignCutoutPoint;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

/** Draft 화면에 필요한 상태·선택·후보 메타데이터만 반환하며 비공개 S3 Key는 포함하지 않는다. */
public record JarDesignDraftDetailResponse(Long draftId, JarDraftStatus status, JarDraftDesignType selectedDesignType,
        Long selectedGenerationId, BigDecimal slotCenterX, BigDecimal slotCenterY, BigDecimal slotSizeRatio,
        List<JarDesignCutoutPoint> cutoutPoints, List<List<JarDesignCutoutPoint>> cutoutRegions,
        LocalDateTime expiresAt, Long finalizedJarId, List<GenerationItem> generations) {
    public record GenerationItem(Long generationId, JarAiStyle style, JarAiGenerationStatus status,
                                 JarAiGenerationErrorCode errorCode, LocalDateTime completedAt) { }
}
