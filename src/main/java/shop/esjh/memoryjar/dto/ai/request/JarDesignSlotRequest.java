package shop.esjh.memoryjar.dto.ai.request;

import jakarta.validation.constraints.NotNull;
import java.math.BigDecimal;

/** 커스텀 이미지 위 Slot의 정규화된 중심 좌표와 크기를 저장한다. */
public record JarDesignSlotRequest(@NotNull BigDecimal centerX, @NotNull BigDecimal centerY, @NotNull BigDecimal sizeRatio) { }
