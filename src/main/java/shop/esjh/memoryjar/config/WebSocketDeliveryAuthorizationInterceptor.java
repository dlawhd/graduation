package shop.esjh.memoryjar.config;

import java.security.Principal;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.context.event.EventListener;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.simp.SimpMessageType;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.messaging.SessionDisconnectEvent;
import shop.esjh.memoryjar.jwt.SessionValidityService;

/** 이미 구독한 소켓도 실제 배달 직전에 현재 로그인과 저금통 권한을 다시 검사한다. */
@Component
public class WebSocketDeliveryAuthorizationInterceptor implements ChannelInterceptor {
    private final Map<String, Principal> sessions = new ConcurrentHashMap<>();
    private final Map<String, org.springframework.web.socket.WebSocketSession> connections = new ConcurrentHashMap<>();
    private final SessionValidityService sessionValidityService;
    private final WebSocketAuthChannelInterceptor subscriptionAuthorization;

    public WebSocketDeliveryAuthorizationInterceptor(SessionValidityService sessionValidityService,
            WebSocketAuthChannelInterceptor subscriptionAuthorization) {
        this.sessionValidityService = sessionValidityService;
        this.subscriptionAuthorization = subscriptionAuthorization;
    }

    public void remember(String sessionId, Principal user) {
        if (sessionId != null && user != null) sessions.put(sessionId, user);
    }

    public void connected(org.springframework.web.socket.WebSocketSession connection) {
        connections.put(connection.getId(), connection);
    }

    public void forget(String sessionId) {
        sessions.remove(sessionId);
        connections.remove(sessionId);
    }

    private void close(String sessionId) {
        var connection = connections.get(sessionId);
        if (connection != null && connection.isOpen()) {
            try {
                connection.close(org.springframework.web.socket.CloseStatus.POLICY_VIOLATION);
            } catch (java.io.IOException ignored) {
                // 배달은 이미 차단했다. 닫기 실패가 다른 구독자에게 영향을 주지 않게 한다.
            }
        }
    }

    /** JWT 만료 뒤 조용히 메시지만 멈추지 않고 연결도 닫아 클라이언트가 재인증·재연결하게 한다. */
    @org.springframework.scheduling.annotation.Scheduled(fixedDelay = 5000)
    public void closeExpiredConnections() {
        sessions.forEach((id, principal) -> {
            if (principal instanceof Authentication authentication
                    && authentication.getPrincipal() instanceof Map<?, ?> values
                    && values.get("tokenExpiresAt") instanceof Number expiresAt
                    && expiresAt.longValue() <= System.currentTimeMillis()) close(id);
        });
    }

    public boolean isCurrent(Principal user) {
        if (!(user instanceof Authentication authentication)
                || !(authentication.getPrincipal() instanceof Map<?, ?> values)) return false;
        Object expiry = values.get("tokenExpiresAt");
        Object version = values.get("sessionVersion");
        Object id = values.get("userId");
        if (!(expiry instanceof Number time) || time.longValue() <= System.currentTimeMillis()
                || !(version instanceof Number number) || id == null) return false;
        try {
            return sessionValidityService.isCurrent(Long.parseLong(id.toString()), number.longValue());
        } catch (NumberFormatException invalidIdentity) {
            return false;
        }
    }

    @Override
    public Message<?> preSend(Message<?> message, MessageChannel channel) {
        StompHeaderAccessor headers = StompHeaderAccessor.wrap(message);
        // SimpleBroker의 배달 프레임에는 STOMP command가 없을 수 있다. 공통 SIMP 타입으로 검사한다.
        if (headers.getMessageType() != SimpMessageType.MESSAGE) return message;
        Principal user = sessions.get(headers.getSessionId());
        if (!isCurrent(user)) {
            close(headers.getSessionId());
            return null;
        }
        try {
            // 브로커의 수신 프레임에는 Principal이 없을 수 있어 CONNECT 때 보관한 인증을 사용한다.
            headers.setUser(user);
            subscriptionAuthorization.validateSubscribe(headers);
            return message;
        } catch (org.springframework.security.access.AccessDeniedException denied) {
            close(headers.getSessionId());
            return null;
        }
    }

    @EventListener
    public void disconnected(SessionDisconnectEvent event) {
        forget(event.getSessionId());
    }
}
