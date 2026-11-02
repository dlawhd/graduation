package shop.esjh.memoryjar.dto.support;

import jakarta.validation.constraints.*;

/** 재전송 식별자와 추가 대화만 받는다. 운영자 여부는 요청 본문으로 결정하지 않는다. */
public record SupportMessageRequest(@NotBlank @Size(max = 3000) String content,
        @NotBlank @Pattern(regexp = "[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}") String requestId,
        boolean waitingForUser) { }
