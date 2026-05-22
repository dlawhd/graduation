/*
package com.example.demo.dto.redis;

import com.example.demo.enums.chat.ChatMessageType;

import java.time.LocalDateTime;

*/
/*
 * RedisChatMessageEvent 역할
 *
 * Redis Pub/Sub으로 서버 내부에서 주고받을 채팅 이벤트 모양이다.
 *
 * 쉽게 말하면:
 * - 사용자가 채팅을 보내면
 * - DB에 저장된 메시지 정보를
 * - Redis 채널로 한 번 더 방송하기 위한 데이터 꾸러미다.
 *//*

public record RedisChatMessageEvent(
        Long messageId,
        Long jarId,
        Long senderId,
        String senderName,
        ChatMessageType type,
        String content,
        LocalDateTime createdAt
) {
}*/
