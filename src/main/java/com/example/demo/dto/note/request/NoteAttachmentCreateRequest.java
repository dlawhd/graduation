package com.example.demo.dto.note.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public record NoteAttachmentCreateRequest(
        @NotBlank(message = "s3Key는 비어 있을 수 없어.")
        String s3Key,

        @NotBlank(message = "url은 비어 있을 수 없어.")
        String url,

        String thumbnailUrl,

        @NotBlank(message = "contentType은 비어 있을 수 없어.")
        String contentType,

        @NotNull(message = "size는 필수야.")
        Long size
) {
}