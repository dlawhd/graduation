package com.example.demo.dto.jar.response;

import com.example.demo.enums.jar.JarRole;

import java.time.OffsetDateTime;

// 멤버 목록에서 사람 1명의 정보
public record JarMemberItem(
        Long userId,
        String nickname,
        String profileImageUrl,
        JarRole role,
        OffsetDateTime joinedAt
) {
}