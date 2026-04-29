package com.example.demo.service.redis;

import com.example.demo.dto.redis.RedisChatMessageEvent;
import com.example.demo.dto.chat.response.ChatSocketMessageResponse;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.data.redis.connection.Message;
import org.springframework.data.redis.connection.MessageListener;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;

/*
 * RedisChatSubscriber 역할
 *
 * Redis 채널에서 채팅 이벤트를 받아 WebSocket 구독자에게 전달하는 클래스다.
 *
 * 쉽게 말하면:
 * - Redis 방송국에서 "새 채팅 왔어!" 메시지를 듣고
 * - 실제 WebSocket 채팅방으로 다시 뿌려주는 역할이다.
 */
@Component
public class RedisChatSubscriber implements MessageListener {

    private final ObjectMapper objectMapper;
    private final SimpMessagingTemplate messagingTemplate;

    public RedisChatSubscriber(
            ObjectMapper objectMapper,
            SimpMessagingTemplate messagingTemplate
    ) {
        this.objectMapper = objectMapper;
        this.messagingTemplate = messagingTemplate;
    }

    /*
     * Redis에서 메시지를 받으면 자동으로 실행된다.
     */
    @Override
    public void onMessage(Message message, byte[] pattern) {
        try {
            // Redis 메시지 본문을 문자열로 변환
            String body = new String(message.getBody(), StandardCharsets.UTF_8);

            // JSON 문자열을 Java 객체로 변환
            RedisChatMessageEvent event =
                    objectMapper.readValue(body, RedisChatMessageEvent.class);

            // 프론트가 받는 WebSocket 응답 DTO로 변환
            ChatSocketMessageResponse response = new ChatSocketMessageResponse(
                    event.messageId(),
                    event.jarId(),
                    event.senderId(),
                    event.senderName(),
                    event.type(),
                    event.content(),
                    event.createdAt()
            );

            // 기존 WebSocket 구독 주소로 메시지 전달
            messagingTemplate.convertAndSend(
                    "/topic/jars/" + event.jarId() + "/chat",
                    response
            );
        } catch (Exception e) {
            throw new IllegalStateException("Redis 채팅 메시지 처리에 실패했어요.", e);
        }
    }
}