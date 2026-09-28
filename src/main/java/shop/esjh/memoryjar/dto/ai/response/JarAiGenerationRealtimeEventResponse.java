package shop.esjh.memoryjar.dto.ai.response;

import shop.esjh.memoryjar.enums.ai.JarAiGenerationErrorCode;
import shop.esjh.memoryjar.enums.ai.JarAiGenerationStatus;
import shop.esjh.memoryjar.enums.ai.JarAiStyle;

/**
 * AI 후보 상태가 끝났음을 Draft OWNER 화면에 알리는 WebSocket 신호다.
 * 상세 상태는 이벤트 수신 뒤 Draft REST API에서 다시 읽어 이벤트 유실과 재연결에도 안전하게 복구한다.
 */
public record JarAiGenerationRealtimeEventResponse(
        Long draftId,
        Long generationId,
        JarAiStyle style,
        JarAiGenerationStatus status,
        JarAiGenerationErrorCode errorCode
) {
}
