package shop.esjh.memoryjar.dto.ai.response;

import java.time.LocalDateTime;

/**
 * 검증·심사·저장을 모두 통과해 새로 생성된 디자인 Draft의 식별 정보를 반환한다.
 */
public record JarDesignDraftCreateResponse(
        Long draftId,
        LocalDateTime expiresAt
) {
}
