package shop.esjh.memoryjar.config;

import shop.esjh.memoryjar.repository.jar.JarMemberRepository;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Component;
import org.springframework.messaging.support.ChannelInterceptor;

import java.security.Principal;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * WebSocketAuthChannelInterceptor 역할
 *
 * 이 클래스는 WebSocket에서 사용자가 어떤 주소를 구독하거나 메시지를 보낼 때,
 * 그 사용자가 정말 그 주소를 사용할 권한이 있는지 검사하는 보안 문지기입니다.
 *
 * 쉽게 말하면:
 * - /topic/users/{userId}/notifications 는 본인만 구독 가능
 * - /topic/jars/{jarId}/... 는 해당 저금통 멤버만 구독 가능
 * - /app/jars/{jarId}/chat.send 는 해당 저금통 멤버만 전송 가능
 *
 * REST API에서는 Controller/Service에서 권한 검사를 하지만,
 * WebSocket의 SUBSCRIBE는 Controller를 직접 거치지 않을 수 있어서
 * 이런 별도 검사 장치가 필요합니다.
 */
@Component
public class WebSocketAuthChannelInterceptor implements ChannelInterceptor {

    // /topic/users/1/notifications 같은 알림 구독 주소를 검사하기 위한 패턴
    private static final Pattern USER_NOTIFICATION_TOPIC_PATTERN =
            Pattern.compile("^/topic/users/(\\d+)/notifications$");

    // /topic/jars/10/chat, /topic/jars/10/members, /topic/jars/10/open 같은 저금통 구독 주소를 검사하기 위한 패턴
    private static final Pattern JAR_TOPIC_PATTERN =
            Pattern.compile("^/topic/jars/(\\d+)(/.*)?$");

    // /app/jars/10/chat.send 같은 채팅 전송 주소를 검사하기 위한 패턴
    private static final Pattern JAR_CHAT_SEND_PATTERN =
            Pattern.compile("^/app/jars/(\\d+)/chat\\.send$");

    // 저금통 멤버인지 확인하기 위한 Repository
    private final JarMemberRepository jarMemberRepository;

    public WebSocketAuthChannelInterceptor(JarMemberRepository jarMemberRepository) {
        this.jarMemberRepository = jarMemberRepository;
    }

    /**
     * WebSocket 메시지가 서버 안쪽으로 들어오기 전에 실행되는 메서드입니다.
     *
     * 여기서 CONNECT, SUBSCRIBE, SEND 요청을 검사합니다.
     */
    @Override
    public Message<?> preSend(Message<?> message, MessageChannel channel) {
        // STOMP 메시지 정보를 쉽게 꺼내기 위한 도구입니다.
        StompHeaderAccessor accessor = StompHeaderAccessor.wrap(message);

        // 지금 들어온 명령이 CONNECT인지, SUBSCRIBE인지, SEND인지 확인합니다.
        StompCommand command = accessor.getCommand();

        // CONNECT / SUBSCRIBE / SEND가 아니면 그대로 통과시킵니다.
        if (command == null) {
            return message;
        }

        // WebSocket 연결 시도는 로그인 사용자만 허용합니다.
        if (StompCommand.CONNECT.equals(command)) {
            validateAuthenticated(accessor.getUser());
            return message;
        }

        // 특정 topic을 구독하려는 경우 권한을 검사합니다.
        if (StompCommand.SUBSCRIBE.equals(command)) {
            validateSubscribe(accessor);
            return message;
        }

        // 클라이언트가 서버로 메시지를 보내려는 경우 권한을 검사합니다.
        if (StompCommand.SEND.equals(command)) {
            validateSend(accessor);
            return message;
        }

        // DISCONNECT, UNSUBSCRIBE 등은 그대로 통과시킵니다.
        return message;
    }

    /**
     * SUBSCRIBE 권한 검사
     *
     * 사용자가 어떤 topic을 구독하려고 할 때 실행됩니다.
     */
    private void validateSubscribe(StompHeaderAccessor accessor) {
        // 현재 로그인한 사용자 ID를 꺼냅니다.
        Long currentUserId = extractCurrentUserId(accessor.getUser());

        // 사용자가 구독하려는 주소입니다.
        String destination = accessor.getDestination();

        if (destination == null || destination.isBlank()) {
            throw new AccessDeniedException("구독 주소가 비어 있습니다.");
        }

        // 1. 내 알림 topic 구독 검사
        // 예: /topic/users/3/notifications
        Matcher userNotificationMatcher = USER_NOTIFICATION_TOPIC_PATTERN.matcher(destination);

        if (userNotificationMatcher.matches()) {
            Long targetUserId = Long.parseLong(userNotificationMatcher.group(1));

            // 내 userId와 topic 안의 userId가 같아야 합니다.
            if (!currentUserId.equals(targetUserId)) {
                throw new AccessDeniedException("다른 사용자의 알림은 구독할 수 없습니다.");
            }

            return;
        }

        // 2. 저금통 topic 구독 검사
        // 예: /topic/jars/10/chat
        // 예: /topic/jars/10/members
        // 예: /topic/jars/10/open
        // 예: /topic/jars/10/daily-draw
        // 예: /topic/jars/10/notes/5
        Matcher jarTopicMatcher = JAR_TOPIC_PATTERN.matcher(destination);

        if (jarTopicMatcher.matches()) {
            Long jarId = Long.parseLong(jarTopicMatcher.group(1));

            validateJarMember(jarId, currentUserId);

            return;
        }

        // 우리가 허용한 topic 구조가 아니면 막습니다.
        throw new AccessDeniedException("허용되지 않은 WebSocket 구독 주소입니다.");
    }

    /**
     * SEND 권한 검사
     *
     * 사용자가 /app/... 주소로 메시지를 보낼 때 실행됩니다.
     */
    private void validateSend(StompHeaderAccessor accessor) {
        // 현재 로그인한 사용자 ID를 꺼냅니다.
        Long currentUserId = extractCurrentUserId(accessor.getUser());

        // 사용자가 메시지를 보내려는 주소입니다.
        String destination = accessor.getDestination();

        if (destination == null || destination.isBlank()) {
            throw new AccessDeniedException("전송 주소가 비어 있습니다.");
        }

        // 현재 프로젝트에서 WebSocket SEND로 쓰는 주소:
        // /app/jars/{jarId}/chat.send
        Matcher chatSendMatcher = JAR_CHAT_SEND_PATTERN.matcher(destination);

        if (chatSendMatcher.matches()) {
            Long jarId = Long.parseLong(chatSendMatcher.group(1));

            validateJarMember(jarId, currentUserId);

            return;
        }

        // 우리가 허용한 SEND 주소가 아니면 막습니다.
        throw new AccessDeniedException("허용되지 않은 WebSocket 전송 주소입니다.");
    }

    /**
     * 로그인 여부만 확인하는 메서드입니다.
     */
    private void validateAuthenticated(Principal principal) {
        if (principal == null) {
            throw new AccessDeniedException("WebSocket 연결에는 로그인이 필요합니다.");
        }
    }

    /**
     * 현재 사용자가 해당 저금통의 active 멤버인지 확인합니다.
     */
    private void validateJarMember(Long jarId, Long currentUserId) {
        boolean activeMember =
                jarMemberRepository.existsByJar_JarIdAndUser_IdAndDeletedAtIsNull(
                        jarId,
                        currentUserId
                );

        if (!activeMember) {
            throw new AccessDeniedException("해당 저금통의 멤버만 WebSocket을 사용할 수 있습니다.");
        }
    }

    /**
     * WebSocket Principal에서 현재 로그인한 userId를 꺼냅니다.
     *
     * 현재 프로젝트는 JwtAuthenticationFilter에서 principal을 Map 형태로 넣고 있습니다.
     * 예:
     * principal.put("userId", userId)
     */
    private Long extractCurrentUserId(Principal principal) {
        if (principal == null) {
            throw new AccessDeniedException("인증 정보가 없습니다.");
        }

        if (principal instanceof Authentication authentication) {
            Object authenticationPrincipal = authentication.getPrincipal();

            if (authenticationPrincipal instanceof Map<?, ?> map) {
                Object userIdValue = map.get("userId");

                if (userIdValue instanceof Number number) {
                    return number.longValue();
                }

                if (userIdValue instanceof String userIdText) {
                    return Long.parseLong(userIdText);
                }
            }
        }

        throw new AccessDeniedException("WebSocket 인증 정보를 확인할 수 없습니다.");
    }
}