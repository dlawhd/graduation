package shop.esjh.memoryjar.config;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.MessageBuilder;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.TestingAuthenticationToken;
import shop.esjh.memoryjar.repository.ai.JarDesignDraftRepository;
import shop.esjh.memoryjar.repository.jar.JarMemberRepository;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

/** Draft 생성 WebSocket topic을 소유자 외 사용자가 구독하지 못하는지 검증한다. */
@ExtendWith(MockitoExtension.class)
class WebSocketAuthChannelInterceptorTest {

    @Mock private JarMemberRepository jarMemberRepository;
    @Mock private JarDesignDraftRepository draftRepository;
    @Mock private MessageChannel channel;

    @Test
    void subscribe_allowsDraftOwner() {
        when(draftRepository.existsByDraftIdAndOwner_Id(10L, 1L)).thenReturn(true);
        WebSocketAuthChannelInterceptor interceptor = interceptor();
        Message<byte[]> message = subscribeMessage(1L, "/topic/design-drafts/10/generations");

        assertThat(interceptor.preSend(message, channel)).isSameAs(message);
    }

    @Test
    void subscribe_rejectsOtherUser() {
        when(draftRepository.existsByDraftIdAndOwner_Id(10L, 2L)).thenReturn(false);
        WebSocketAuthChannelInterceptor interceptor = interceptor();

        assertThatThrownBy(() -> interceptor.preSend(
                subscribeMessage(2L, "/topic/design-drafts/10/generations"), channel))
                .isInstanceOf(AccessDeniedException.class);
    }

    private WebSocketAuthChannelInterceptor interceptor() {
        return new WebSocketAuthChannelInterceptor(jarMemberRepository, draftRepository);
    }

    private Message<byte[]> subscribeMessage(Long userId, String destination) {
        StompHeaderAccessor accessor = StompHeaderAccessor.create(StompCommand.SUBSCRIBE);
        accessor.setDestination(destination);
        accessor.setUser(new TestingAuthenticationToken(Map.of("userId", userId), null, "ROLE_USER"));
        return MessageBuilder.createMessage(new byte[0], accessor.getMessageHeaders());
    }
}
