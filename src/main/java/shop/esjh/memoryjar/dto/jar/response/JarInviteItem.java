package shop.esjh.memoryjar.dto.jar.response;

import java.time.OffsetDateTime;

// 초대코드 목록에서 초대장 1개의 정보
public record JarInviteItem(
        Long inviteId,
        String code,
        OffsetDateTime expiresAt,
        OffsetDateTime revokedAt,
        Integer maxUses,
        Integer usedCount,
        boolean isActive,
        Long createdBy,
        OffsetDateTime createdAt
) {
}