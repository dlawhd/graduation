package shop.esjh.memoryjar.dto.support;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** 운영자 답변은 일반 텍스트로만 받으며 크기를 서버에서도 제한한다. */
public record SupportReplyRequest(@NotBlank @Size(max = 3000) String reply) { }
