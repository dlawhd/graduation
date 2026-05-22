package shop.esjh.memoryjar.dto.jar.response;

import shop.esjh.memoryjar.enums.jar.JarLockLevel;
import shop.esjh.memoryjar.enums.jar.JarOpenMode;
import shop.esjh.memoryjar.enums.jar.JarRole;

import java.time.OffsetDateTime;

// 저금통 생성이 끝난 뒤 서버가 돌려주는 응답
// 저금통이 잘 만들어졌고, 너는 OWNER야!" 라고 알려주는 결과표
public record JarCreateResponse(
        Long jarId,
        String name,
        OffsetDateTime openAt,
        JarOpenMode openMode,
        JarLockLevel lockLevel,
        JarRole myRole,
        OffsetDateTime createdAt
) {
}