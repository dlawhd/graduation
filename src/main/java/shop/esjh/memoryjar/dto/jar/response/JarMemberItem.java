package shop.esjh.memoryjar.dto.jar.response;

import shop.esjh.memoryjar.enums.jar.JarRole;

import java.time.OffsetDateTime;

// 멤버 목록에서 사람 1명의 정보
public record JarMemberItem(
        Long userId,
        String name,
        String profileImageUrl,
        JarRole role,
        OffsetDateTime joinedAt
) {
}