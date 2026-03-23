package com.example.demo.dto.jar.response;

import java.time.OffsetDateTime;

// 초대장 만들기 완료! 이 코드와 링크를 써!
public record JarInviteCreateResponse(
        Long inviteId,
        Long jarId,
        String code,
        String inviteLink,
        OffsetDateTime expiresAt,
        Integer maxUses,
        Integer usedCount,
        boolean isActive,
        OffsetDateTime createdAt
) {
}