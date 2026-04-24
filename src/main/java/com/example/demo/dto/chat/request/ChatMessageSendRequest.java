package com.example.demo.dto.chat.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

// 사용자가 채팅 메시지를 보낼 때 프론트에서 서버로 보내는 요청 DTO
public record ChatMessageSendRequest(

        // 채팅 메시지 내용
        // 비어 있거나 공백만 있으면 안 됨
        @NotBlank(message = "채팅 내용은 비어 있을 수 없어요.")

        // 너무 긴 채팅을 막기 위한 제한
        // 처음에는 1000자 정도면 충분함
        @Size(max = 1000, message = "채팅 내용은 1000자 이하로 입력해 주세요.")
        String content
) {
}