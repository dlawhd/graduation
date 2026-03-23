package com.example.demo.dto.jar.response;

import java.time.OffsetDateTime;

// 초대코드 폐기 후 돌려주는 응답
// 몇 번 초대장을 언제 막았는지

public record JarInviteRevokeResponse(
        Long inviteId,
        OffsetDateTime revokedAt
) {
}