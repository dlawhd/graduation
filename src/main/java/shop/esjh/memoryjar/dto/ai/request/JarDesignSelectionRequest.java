package shop.esjh.memoryjar.dto.ai.request;

import jakarta.validation.constraints.NotNull;
import shop.esjh.memoryjar.enums.ai.JarDraftDesignType;

/** Draft에서 ORIGINAL·AI·DEFAULT 중 현재 최종화할 디자인을 고르는 요청이다. */
public record JarDesignSelectionRequest(@NotNull JarDraftDesignType designType, Long generationId) { }
