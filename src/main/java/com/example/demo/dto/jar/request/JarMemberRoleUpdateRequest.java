package com.example.demo.dto.jar.request;

import com.example.demo.enums.jar.JarRole;
import jakarta.validation.constraints.NotNull;

// 멤버 역할을 바꿀 때 보내는 요청
public record JarMemberRoleUpdateRequest(
        @NotNull
        JarRole role
) {
}