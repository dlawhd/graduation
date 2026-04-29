/*
package com.example.demo.service.redis;

import com.example.demo.dto.redis.RedisChatMessageEvent;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

*/
/*
 * RedisChatPublisher 역할
 *
 * 저장된 채팅 메시지를 Redis 채널에 발행하는 클래스다.
 *
 * 쉽게 말하면:
 * - "36번 저금통에 새 메시지 왔어!"
 * - 라고 Redis 방송국에 알려주는 역할이다.
 *//*

@Component
public class RedisChatPublisher {

    private final StringRedisTemplate stringRedisTemplate;
    private final ObjectMapper objectMapper;

    public RedisChatPublisher(
            StringRedisTemplate stringRedisTemplate,
            ObjectMapper objectMapper
    ) {
        this.stringRedisTemplate = stringRedisTemplate;
        this.objectMapper = objectMapper;
    }

    */
/*
     * 특정 저금통 채팅 채널로 메시지를 발행한다.
     *//*

    public void publish(RedisChatMessageEvent event) {
        try {
            // 저금통별 Redis 채널 이름
            String channel = "jar-chat:" + event.jarId();

            // Java 객체를 JSON 문자열로 변환
            String message = objectMapper.writeValueAsString(event);

            // Redis 채널에 메시지 발행
            stringRedisTemplate.convertAndSend(channel, message);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Redis 채팅 메시지 직렬화에 실패했어요.", e);
        }
    }
}*/
