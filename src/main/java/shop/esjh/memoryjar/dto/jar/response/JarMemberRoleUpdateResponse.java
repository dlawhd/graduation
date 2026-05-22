package shop.esjh.memoryjar.dto.jar.response;


import shop.esjh.memoryjar.enums.jar.JarRole;

import java.time.OffsetDateTime;

// 멤버 역할 변경이 끝난 뒤 돌려주는 응답
public record JarMemberRoleUpdateResponse(
        Long jarId,
        Long userId,
        JarRole role,
        OffsetDateTime updatedAt
) {
}