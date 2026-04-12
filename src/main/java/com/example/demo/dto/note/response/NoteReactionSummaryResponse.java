package com.example.demo.dto.note.response;

import com.example.demo.enums.note.NoteReactionEmoji;

import java.util.List;

/*
 * 이 DTO는 "쪽지 1개의 리액션 전체 상태"를 담는 역할을 함
 *
 * 쉽게 말하면:
 * - 이 쪽지(noteId)가 몇 번 쪽지인지
 * - 내가 지금 어떤 리액션을 눌렀는지
 * - 각 리액션이 몇 개인지
 * 한 번에 내려주는 응답이야.
 */
public record NoteReactionSummaryResponse(
        Long noteId,
        NoteReactionEmoji myReaction,
        List<NoteReactionCountItem> counts
) {
}