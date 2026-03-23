package com.example.demo.dto.jar.response;

import java.time.OffsetDateTime;

/**
 * JarKickResponse
 *
 * 멤버 강퇴가 끝난 뒤 돌려주는 응답이야.
 */
public record JarKickResponse(
        Long jarId,
        Long kickedUserId,
        OffsetDateTime kickedAt
) {
}