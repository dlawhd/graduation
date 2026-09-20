package shop.esjh.memoryjar.dto.ai.request;

import jakarta.validation.constraints.NotNull;
import shop.esjh.memoryjar.enums.ai.JarAiStyle;

/** 서버 Catalog에 있는 스타일만 지정하며 Prompt와 버전은 클라이언트가 제출하지 않는다. */
public record JarAiGenerationCreateRequest(@NotNull JarAiStyle style, Long seed) { }
