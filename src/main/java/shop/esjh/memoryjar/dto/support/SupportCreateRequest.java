package shop.esjh.memoryjar.dto.support;

import jakarta.validation.constraints.*;

/** 소유자와 실패 메타데이터, 파일 키는 서버가 결정하며 원본 공유 동의는 반드시 참이어야 한다. */
public record SupportCreateRequest(@NotNull @Positive Long draftId, @NotNull @Positive Long generationId,
        @NotBlank @Size(max = 1000) String description,
        @NotNull @AssertTrue(message = "문의하려면 원본 이미지 공유에 동의해 주세요.") Boolean shareOriginal) { }
