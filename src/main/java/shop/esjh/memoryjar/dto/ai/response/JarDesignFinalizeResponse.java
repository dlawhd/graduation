package shop.esjh.memoryjar.dto.ai.response;

import shop.esjh.memoryjar.enums.ai.JarDraftDesignType;

/** Draft 최종화가 만든 Jar와 최종 선택 종류를 반환한다. */
public record JarDesignFinalizeResponse(Long jarId, JarDraftDesignType designType) { }
