package com.example.demo.dto.jar.request;

import com.example.demo.enums.jar.JarLockLevel;
import com.example.demo.enums.jar.JarOpenMode;
import com.example.demo.enums.jar.JarTheme;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.OffsetDateTime;

// 저금통을 새로 만들 때 클라이언트가 보내는 요청
// 어떤 이름으로 만들지, 어떤 분위기의 저금통인지, 몇 명까지 들어갈지, 언제 열릴지
public record JarCreateRequest(

        // 저금통 이름은 꼭 있어야 함
        @NotBlank
        @Size(max = 40)
        String name,

        // 설명은 없어도 되지만, 너무 길면 안 됌
        @Size(max = 200)
        String description,

        // 이제 값은 COUPLE / FRIEND / FAMILY / CUSTOM 중 하나야.
        @NotNull
        JarTheme theme,

        // 최소 2명, 최대 50명까지 허용
        @NotNull
        @Min(2)
        @Max(50)
        Integer maxMembers,

        // 언제 열릴지 시간은 꼭 필요
        @NotNull
        OffsetDateTime openAt,

        // 오픈 방식도 꼭 필요
        @NotNull
        JarOpenMode openMode,

        // 잠금 레벨도 꼭 필요 (예: HIDDEN, META_ONLY, TITLE_ONLY)
        @NotNull
        JarLockLevel lockLevel
) {
}