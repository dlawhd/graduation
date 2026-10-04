package shop.esjh.memoryjar.config;

import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.messaging.Message;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.messaging.simp.SimpMessageType;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.messaging.simp.broker.SimpleBrokerMessageHandler;
import org.springframework.messaging.support.ExecutorSubscribableChannel;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.MessageBuilder;
import org.springframework.security.authentication.TestingAuthenticationToken;
import shop.esjh.memoryjar.jwt.SessionValidityService;
import shop.esjh.memoryjar.repository.ai.JarDesignDraftRepository;
import shop.esjh.memoryjar.repository.jar.JarMemberRepository;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

/** 연결할 때 허용됐어도 탈퇴·강퇴·비밀번호 재설정 뒤에는 기존 구독으로 배달하지 않는지 확인한다. */
class WebSocketDeliveryAuthorizationInterceptorTest {
    private final JarMemberRepository members = mock(JarMemberRepository.class);
    private final SessionValidityService sessions = mock(SessionValidityService.class);
    private WebSocketDeliveryAuthorizationInterceptor interceptor;

    @BeforeEach
    void setup() {
        interceptor = new WebSocketDeliveryAuthorizationInterceptor(sessions,
                new WebSocketAuthChannelInterceptor(members, mock(JarDesignDraftRepository.class)));
        interceptor.remember("session", identity(System.currentTimeMillis() + 60_000));
    }

    private TestingAuthenticationToken identity(long expiresAt) {
        return new TestingAuthenticationToken(Map.of("userId", 1L, "sessionVersion", 0L,
                "tokenExpiresAt", expiresAt), null, "ROLE_USER");
    }

    private Message<byte[]> delivery(String destination) {
        var headers = StompHeaderAccessor.create(StompCommand.MESSAGE);
        headers.setSessionId("session");
        headers.setDestination(destination);
        return MessageBuilder.createMessage(new byte[0], headers.getMessageHeaders());
    }

    @Test
    void membershipRevokedStopsExistingChatAndNoteSubscriptions() {
        when(sessions.isCurrent(1L, 0L)).thenReturn(true);
        when(members.existsByJar_JarIdAndUser_IdAndDeletedAtIsNull(10L, 1L)).thenReturn(true, false, false);
        var message = delivery("/topic/jars/10/chat");
        assertThat(interceptor.preSend(message, null)).isSameAs(message);
        assertThat(interceptor.preSend(message, null)).isNull();
        assertThat(interceptor.preSend(delivery("/topic/jars/10/notes/20"), null)).isNull();
    }

    @Test
    void passwordResetStopsAllExistingSubscriptions() {
        var connection = mock(org.springframework.web.socket.WebSocketSession.class);
        when(connection.getId()).thenReturn("session");
        when(connection.isOpen()).thenReturn(true);
        interceptor.connected(connection);
        when(sessions.isCurrent(1L, 0L)).thenReturn(false);
        assertThat(interceptor.preSend(delivery("/topic/users/1/notifications"), null)).isNull();
        verifyNoInteractions(members);
        try {
            verify(connection).close(org.springframework.web.socket.CloseStatus.POLICY_VIOLATION);
        } catch (java.io.IOException failure) { throw new AssertionError(failure); }
    }

    @Test
    void expiredAndUnknownSessionsCannotReceiveMessages() {
        interceptor.remember("session", identity(System.currentTimeMillis() - 1));
        assertThat(interceptor.preSend(delivery("/topic/users/1/notifications"), null)).isNull();
        verifyNoInteractions(sessions);
    }

    @Test
    void actualSimpleBrokerFramesAreBlockedAfterMembershipRevocation() {
        var inbound = new ExecutorSubscribableChannel();
        var outbound = new ExecutorSubscribableChannel();
        var brokerChannel = new ExecutorSubscribableChannel();
        var broker = new SimpleBrokerMessageHandler(inbound, outbound, brokerChannel, java.util.List.of("/topic"));
        var delivered = new java.util.ArrayList<Message<?>>();
        outbound.addInterceptor(interceptor);
        outbound.subscribe(message -> {
            if (SimpMessageHeaderAccessor.getMessageType(message.getHeaders()) == SimpMessageType.MESSAGE) delivered.add(message);
        });
        when(sessions.isCurrent(1L, 0L)).thenReturn(true);
        when(members.existsByJar_JarIdAndUser_IdAndDeletedAtIsNull(10L, 1L)).thenReturn(true, false);
        broker.start();
        try {
            var connect = SimpMessageHeaderAccessor.create(SimpMessageType.CONNECT);
            connect.setSessionId("session");
            inbound.send(MessageBuilder.createMessage(new byte[0], connect.getMessageHeaders()));
            var subscribe = SimpMessageHeaderAccessor.create(SimpMessageType.SUBSCRIBE);
            subscribe.setSessionId("session");
            subscribe.setSubscriptionId("subscription");
            subscribe.setDestination("/topic/jars/10/chat");
            inbound.send(MessageBuilder.createMessage(new byte[0], subscribe.getMessageHeaders()));
            var template = new SimpMessagingTemplate(brokerChannel);
            template.convertAndSend("/topic/jars/10/chat", "권한 있을 때");
            template.convertAndSend("/topic/jars/10/chat", "탈퇴 후 비밀 메시지");
            assertThat(delivered).hasSize(1);
        } finally { broker.stop(); }
    }
}
