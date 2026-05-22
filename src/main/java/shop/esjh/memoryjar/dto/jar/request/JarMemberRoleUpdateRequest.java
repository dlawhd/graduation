package shop.esjh.memoryjar.dto.jar.request;

import shop.esjh.memoryjar.enums.jar.JarRole;
import jakarta.validation.constraints.NotNull;

// 멤버 역할을 바꿀 때 보내는 요청
public record JarMemberRoleUpdateRequest(
        @NotNull
        JarRole role
) {
}