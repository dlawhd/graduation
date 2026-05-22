package shop.esjh.memoryjar.dto.note.response;

import java.util.List;

// 댓글 목록 화면에 필요한 응답
public record NoteCommentListResponse(

        // 댓글 목록
        List<NoteCommentItem> items

) {
}