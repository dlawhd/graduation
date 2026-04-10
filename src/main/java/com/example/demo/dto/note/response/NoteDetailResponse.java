package com.example.demo.dto.note.response;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;

// 쪽지 상세 화면에 필요한 정보
public record NoteDetailResponse(
        Long noteId,
        Long jarId,
        Long authorId,
        String authorName,
        String title,
        String content,
        boolean isEncrypted,
        LocalDate noteDate,
        String location,
        OffsetDateTime createdAt,
        OffsetDateTime updatedAt,
        List<String> tags,
        List<NoteAttachmentResponse> attachments
) {
}