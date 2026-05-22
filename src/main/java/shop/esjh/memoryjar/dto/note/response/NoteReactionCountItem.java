package shop.esjh.memoryjar.dto.note.response;

import shop.esjh.memoryjar.enums.note.NoteReactionEmoji;

/*
 * 이 DTO는 "리액션 종류별 개수 1줄"을 담는 역할을 함
 *
 * 예:
 * - LOVE 3개
 * - SMILE 1개
 *
 * 프론트는 이 값을 받아서
 * ❤️ 3, 😊 1
 * 이런 식으로 보여주면 돼.
 */
public record NoteReactionCountItem(
        NoteReactionEmoji emoji,
        long count
) {
}