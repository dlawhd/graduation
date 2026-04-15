package com.example.demo.dto.note.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

// 댓글을 새로 만들 때 프론트가 보내는 요청값
public record NoteCommentCreateRequest(

        // 댓글 내용은 필수
        @NotBlank(message = "content는 비어 있을 수 없어.")
        @Size(max = 1000, message = "댓글은 1000자 이하로 입력해줘.")
        String content,

        // 어떤 댓글 밑에 달리는 대댓글인지
        // 일반 댓글이면 null
        Long parentCommentId

) {
}