package com.example.demo.config;

import com.example.demo.service.redis.RedisChatSubscriber;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.listener.PatternTopic;
import org.springframework.data.redis.listener.RedisMessageListenerContainer;

/*
 * RedisPubSubConfig 역할
 *
 * Redis Pub/Sub 채널을 구독하도록 설정하는 클래스다.
 *
 * 쉽게 말하면:
 * - Redis 방송국에서 jar-chat:* 채널을 듣고 있다가
 * - 새 채팅 메시지가 오면 RedisChatSubscriber에게 넘겨준다.
 */
@Configuration
public class RedisPubSubConfig {

    /*
     * Redis Pub/Sub 메시지를 듣는 컨테이너
     *
     * jar-chat:* 은 모든 저금통 채팅 채널을 의미한다.
     * 예:
     * - jar-chat:36
     * - jar-chat:45
     */
    @Bean
    public RedisMessageListenerContainer redisMessageListenerContainer(
            RedisConnectionFactory connectionFactory,
            RedisChatSubscriber redisChatSubscriber
    ) {
        RedisMessageListenerContainer container = new RedisMessageListenerContainer();

        // Redis 연결 정보 등록
        container.setConnectionFactory(connectionFactory);

        // jar-chat:* 패턴에 해당하는 모든 채널을 구독
        container.addMessageListener(redisChatSubscriber, new PatternTopic("jar-chat:*"));

        return container;
    }
}