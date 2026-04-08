package com.example.demo.dto.note.response;

public record NoteAttachmentResponse(
        Long attachmentId,
        Integer sortOrder,
        String s3Key,
        String url,
        String thumbnailUrl,
        String contentType,
        Long size
) {
}