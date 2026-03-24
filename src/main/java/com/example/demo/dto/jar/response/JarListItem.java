package com.example.demo.dto.jar.response;

import com.example.demo.enums.jar.JarLockLevel;
import com.example.demo.enums.jar.JarOpenMode;
import com.example.demo.enums.jar.JarRole;
import com.example.demo.enums.jar.JarTheme;

import java.time.OffsetDateTime;

// 리스트 화면에 보이는 저금통 한 줄 정보
public record JarListItem(
        Long jarId,
        String name,
        JarTheme theme,
        String description,
        int memberCount,
        int maxMembers,
        OffsetDateTime openAt,
        JarOpenMode openMode,
        JarLockLevel lockLevel,
        boolean isOpen,
        JarRole myRole,
        OffsetDateTime updatedAt
) {
}