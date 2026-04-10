package com.example.demo.dto.note.response;

import java.time.OffsetDateTime;
import java.util.List;

// 쪽지 작성이 끝난 뒤 서버가 돌려주는 결과표
public record NoteCreateResponse(
        Long noteId,
        Long jarId,
        Long authorId,
        String title,
        String content,
        boolean isEncrypted,
        java.time.LocalDate noteDate,
        String location,
        List<String> tags,
        OffsetDateTime createdAt
) {
}