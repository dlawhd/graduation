package shop.esjh.memoryjar.dto.note.request;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;

public record NoteAttachmentSortUpdateRequest(
        @NotNull(message = "attachmentId는 필수야.")
        Long attachmentId,

        @NotNull(message = "sortOrder는 필수야.")
        @PositiveOrZero(message = "sortOrder는 0 이상이어야 해.")
        Integer sortOrder
) {
}