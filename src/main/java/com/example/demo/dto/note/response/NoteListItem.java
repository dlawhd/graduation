package com.example.demo.dto.note.response;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;

// 쪽지 목록에서 카드 1개에 들어갈 정보
public record NoteListItem(
        Long noteId,
        String title,
        String previewContent,
        LocalDate noteDate,
        String location,
        Long authorId,
        String authorName,
        boolean isEncrypted,
        OffsetDateTime createdAt,
        List<String> tags,
        List<NoteAttachmentResponse> attachments
) {
}