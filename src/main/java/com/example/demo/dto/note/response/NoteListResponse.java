package com.example.demo.dto.note.response;

import java.util.List;

// 쪽지 목록 전체 응답
public record NoteListResponse(
        List<NoteListItem> items,
        int page,
        int size,
        long totalElements,
        int totalPages
) {
}