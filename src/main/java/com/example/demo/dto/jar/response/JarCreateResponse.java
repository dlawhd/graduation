package com.example.demo.dto.jar.response;

import com.example.demo.enums.jar.JarLockLevel;
import com.example.demo.enums.jar.JarOpenMode;
import com.example.demo.enums.jar.JarRole;

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