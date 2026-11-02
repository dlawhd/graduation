package shop.esjh.memoryjar.dto.support;

import jakarta.validation.constraints.*;
import shop.esjh.memoryjar.enums.support.SupportCategory;
import java.time.OffsetDateTime;

/** 일반 문의의 제목/내용과 선택한 문제 상황만 받는다. 계정과 보관 키는 서버가 결정한다. */
public record SupportGeneralCreateRequest(@NotNull SupportCategory category,
        @NotBlank @Size(max = 100) String title, @NotBlank @Size(max = 1000) String description,
        @NotBlank @Pattern(regexp = "[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}") String requestId,
        @Positive Long jarId, @Positive Long draftId,
        @Size(max = 120) String contextPath, @Pattern(regexp = "[A-Za-z0-9_:.\\-]{0,80}") String errorCode,
        OffsetDateTime occurredAt) { }
