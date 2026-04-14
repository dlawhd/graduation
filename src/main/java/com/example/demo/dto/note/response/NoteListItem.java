package com.example.demo.dto.note.response;

import com.example.demo.enums.note.NoteReactionEmoji;

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
        List<NoteAttachmentResponse> attachments,

        // 내가 이 쪽지에 현재 누른 리액션
        // 아직 누른 게 없으면 null
        NoteReactionEmoji myReaction,

        // 리액션 종류별 개수 목록
        // 예: LOVE 2개, SMILE 1개
        List<NoteReactionCountItem> reactionCounts,

        // 댓글 총 개수
        long commentCount
) {
}