package shop.esjh.memoryjar.dto.jar.request;

import shop.esjh.memoryjar.enums.jar.JarLockLevel;
import shop.esjh.memoryjar.enums.jar.JarOpenMode;
import shop.esjh.memoryjar.enums.jar.JarTheme;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;

import java.time.LocalDateTime;

// 이름, 설명, 테마, 최대 인원을 바꾸고 싶을 때 보내는 수정 요청서야.
// PATCH라서 모든 값은 선택
public record JarUpdateRequest(

        // 이름은 선택이지만, 보내면 40자 이하여야 해.
        @Size(max = 40)
        String name,

        // 설명도 선택이지만, 보내면 200자 이하여야 해.
        @Size(max = 200)
        String description,

        // 테마도 선택
        JarTheme theme,

        // 최대 인원도 선택
        @Min(2)
        @Max(50)
        Integer maxMembers,

        // 오픈일
        LocalDateTime openAt,

        // 공개 방식
        JarOpenMode openMode,

        // 잠금 레벨
        JarLockLevel lockLevel
) {
}