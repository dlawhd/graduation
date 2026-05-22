package shop.esjh.memoryjar.dto.note.request;

import jakarta.validation.constraints.NotBlank;

// 이제는 프론트가 url, contentType, size를 직접 보내지 않고 complete까지 끝난 s3Key만 보내게 바꾼다.
public record NoteAttachmentCreateRequest(
        @NotBlank(message = "s3Key는 비어 있을 수 없어.")
        String s3Key
) {
}