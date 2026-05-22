package shop.esjh.memoryjar.dto.jar.response;

import shop.esjh.memoryjar.enums.jar.JarLockLevel;
import shop.esjh.memoryjar.enums.jar.JarOpenMode;
import shop.esjh.memoryjar.enums.jar.JarRole;
import shop.esjh.memoryjar.enums.jar.JarTheme;

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