package shop.esjh.memoryjar.dto.note.response;

import shop.esjh.memoryjar.enums.note.NoteReactionEmoji;

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