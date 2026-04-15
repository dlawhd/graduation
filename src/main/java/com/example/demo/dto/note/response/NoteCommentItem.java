package com.example.demo.dto.note.response;

import java.time.OffsetDateTime;
import java.util.List;

// 댓글 1개를 화면에 보여줄 때 필요한 정보
public record NoteCommentItem(

        // 댓글 번호
        Long commentId,

        // 작성자 번호
        Long userId,

        // 작성자 이름
        String authorName,

        // 부모 댓글 번호
        // 일반 댓글이면 null
        Long parentCommentId,

        // 댓글 내용
        String content,

        // 작성 시간
        OffsetDateTime createdAt,

        // 수정 시간
        OffsetDateTime updatedAt,

        // 이 댓글 아래 달린 대댓글 목록
        List<NoteCommentItem> replies

) {
}