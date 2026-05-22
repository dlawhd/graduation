package shop.esjh.memoryjar.dto.note.request;

import shop.esjh.memoryjar.enums.note.NoteReactionEmoji;
import jakarta.validation.constraints.NotNull;

// 사용자가 쪽지에 어떤 리액션을 누를지 전달할 때 쓰는 요청 객체
// 프론트가 LOVE, SMILE 같은 값을 보내면 백엔드가 그 값을 받아서 저장/변경/취소 로직에 사용해.
public record NoteReactionCreateRequest(

        // 어떤 리액션을 눌렀는지
        // null이면 어떤 감정인지 알 수 없어서 필수로 받는 값이야.
        @NotNull(message = "emoji는 필수야.")
        NoteReactionEmoji emoji

) {
}