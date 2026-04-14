package com.example.demo.dto.note.response;

import java.time.OffsetDateTime;

// 댓글 1개를 화면에 보여줄 때 필요한 정보
public record NoteCommentItem(

        // 댓글 번호
        Long commentId,

        // 작성자 번호
        Long userId,

        // 작성자 이름
        String authorName,

        // 댓글 내용
        String content,

        // 작성 시간
        OffsetDateTime createdAt,

        // 수정 시간
        OffsetDateTime updatedAt

) {
}