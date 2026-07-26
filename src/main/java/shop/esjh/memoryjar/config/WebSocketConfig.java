package shop.esjh.memoryjar.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.messaging.simp.config.ChannelRegistration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;
import shop.esjh.memoryjar.config.properties.AppProperties;

/*
 * WebSocketConfig 역할
 *
 * 이 클래스는 "저금통 채팅 실시간 전송"을 위한 WebSocket 문을 열어주는 설정 파일이다.
 *
 * 쉽게 말하면:
 * - 프론트가 서버와 실시간으로 연결할 수 있는 주소를 만든다. 예: /ws
 * - 사용자가 메시지를 서버로 보낼 주소 규칙을 정한다. 예: /app/...
 * - 서버가 여러 사용자에게 메시지를 뿌릴 주소 규칙을 정한다. 예: /topic/...
 *
 * 현재 실시간 처리 대상:
 * - 저금통 채팅
 * - 사용자 알림
 * - 저금통 멤버 변경
 * - 저금통 오픈
 * - 쪽지 작성과 상태 변경
 * - 댓글과 리액션
 * - 오늘의 추억 한 장
 *
 * 모든 기능은 같은 /ws 연결과 /topic 구독 구조를 사용한다.
 */
@Configuration
@EnableWebSocketMessageBroker
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {

    // WebSocket 요청의 인증과 권한을 검사한다.
    private final WebSocketAuthChannelInterceptor webSocketAuthChannelInterceptor;

    // REST와 WebSocket이 같은 CORS 주소를 사용하도록 공통 설정을 가져온다.
    private final AppProperties appProperties;

    public WebSocketConfig(
            WebSocketAuthChannelInterceptor webSocketAuthChannelInterceptor,
            AppProperties appProperties
    ) {
        this.webSocketAuthChannelInterceptor = webSocketAuthChannelInterceptor;
        this.appProperties = appProperties;
    }

    /*
     * 메시지 브로커 설정
     *
     * 메시지 브로커는 쉽게 말하면 "실시간 메시지 배달부"다.
     *
     * /topic:
     * - 서버가 여러 사용자에게 메시지를 보내는 주소 앞에 붙는다.
     * - 예: /topic/jars/10/chat
     * - 의미: 10번 저금통 채팅방을 보고 있는 사람들에게 메시지를 뿌린다.
     *
     * /app:
     * - 프론트가 서버에게 메시지를 보낼 때 사용하는 주소 앞에 붙는다.
     * - 예: /app/jars/10/chat.send
     * - 의미: 10번 저금통에 채팅 메시지를 보낸다.
     */
    @Override
    public void configureMessageBroker(MessageBrokerRegistry registry) {
        // 서버가 구독자들에게 메시지를 뿌릴 때 사용할 주소 prefix
        registry.enableSimpleBroker("/topic");

        // 프론트가 서버의 @MessageMapping 메서드로 메시지를 보낼 때 사용할 주소 prefix
        registry.setApplicationDestinationPrefixes("/app");
    }

    /*
     * WebSocket으로 들어오는 클라이언트 메시지를 검사하는 설정
     *
     * 여기서 등록한 interceptor는:
     * - CONNECT
     * - SUBSCRIBE
     * - SEND
     *
     * 요청이 들어올 때마다 먼저 실행된다.
     */
    @Override
    public void configureClientInboundChannel(ChannelRegistration registration) {
        registration.interceptors(webSocketAuthChannelInterceptor);
    }

    /*
     * WebSocket 연결 주소 설정
     *
     * 프론트는 이 주소로 WebSocket 연결을 시작한다.
     *
     * 예:
     * - 로컬: ws://localhost:8080/ws
     * - 배포: wss://api.esjh.shop/ws
     *
     * setAllowedOriginPatterns:
     * - 어떤 프론트 주소에서 WebSocket 연결을 허용할지 정한다.
     * - 현재 SecurityConfig의 CORS 허용 주소와 맞춰서 작성했다.
     */
    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        registry.addEndpoint("/ws")
                /*
                 * SecurityConfig와 완전히 같은 Origin 목록을 사용한다.
                 *
                 * application.yml:
                 * - 로컬 주소
                 *
                 * application-prod.yml:
                 * - 운영 주소
                 */
                .setAllowedOriginPatterns(
                        appProperties.getCors()
                                .getAllowedOriginPatterns()
                                .toArray(String[]::new)
                );
    }
}
