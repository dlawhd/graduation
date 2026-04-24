package com.example.demo.dto.chat.response;

import com.example.demo.enums.chat.ChatMessageType;

import java.time.LocalDateTime;

// 서버가 프론트에게 채팅 메시지 1개를 내려줄 때 사용하는 응답 DTO
public record ChatMessageResponse(

        // 채팅 메시지 고유 ID
        Long messageId,

        // 이 메시지가 속한 저금통 ID
        Long jarId,

        // 보낸 사람 ID
        // SYSTEM 메시지는 sender가 없으므로 null 가능
        Long senderId,

        // 보낸 사람 이름
        // SYSTEM 메시지는 null 가능
        String senderName,

        // 메시지 종류
        // TEXT 또는 SYSTEM
        ChatMessageType type,

        // 실제 채팅 내용
        // 사용자가 입력한 공백도 그대로 내려준다.
        String content,

        // 이 메시지가 현재 로그인한 사용자가 보낸 메시지인지 여부
        boolean mine,

        // 메시지가 만들어진 시간
        LocalDateTime createdAt
) {
}