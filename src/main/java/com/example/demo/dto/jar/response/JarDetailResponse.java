package com.example.demo.dto.jar.response;

import com.example.demo.enums.jar.JarLockLevel;
import com.example.demo.enums.jar.JarOpenMode;
import com.example.demo.enums.jar.JarRole;
import com.example.demo.enums.jar.JarTheme;

import java.time.OffsetDateTime;

// 저금통 하나를 눌렀을 때 나오는 자세한 설명 카드
public record JarDetailResponse(
        Long jarId,
        String name,
        String description,
        JarTheme theme,
        Long ownerId,
        int memberCount,
        int maxMembers,
        OffsetDateTime openAt,
        JarOpenMode openMode,
        JarLockLevel lockLevel,
        boolean isOpen,
        JarRole myRole,
        OffsetDateTime createdAt,
        OffsetDateTime updatedAt
) {
}