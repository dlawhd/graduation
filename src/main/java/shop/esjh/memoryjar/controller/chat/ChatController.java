package shop.esjh.memoryjar.controller.chat;

import org.springframework.messaging.simp.SimpMessagingTemplate;
import shop.esjh.memoryjar.dto.chat.request.ChatMessageSendRequest;
import shop.esjh.memoryjar.dto.chat.request.ChatReadRequest;
import shop.esjh.memoryjar.dto.chat.response.ChatMessageListResponse;
import shop.esjh.memoryjar.dto.chat.response.ChatMessageResponse;
import shop.esjh.memoryjar.dto.chat.response.ChatSocketMessageResponse;
import shop.esjh.memoryjar.dto.chat.response.ChatUnreadResponse;
import shop.esjh.memoryjar.dto.response.ApiResponse;
import shop.esjh.memoryjar.service.chat.ChatService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.Map;

import static org.springframework.http.HttpStatus.UNAUTHORIZED;

@RestController
@RequestMapping("/api/v1/jars/{jarId}/chat")
public class ChatController {

    // REST fallback으로 저장된 메시지를 WebSocket 구독자에게 방송하기 위한 도구다.
    private final SimpMessagingTemplate messagingTemplate;

    private final ChatService chatService;

    public ChatController(
            ChatService chatService,
            SimpMessagingTemplate messagingTemplate
    ) {
        this.chatService = chatService;
        this.messagingTemplate = messagingTemplate;
    }

    /*
     * 채팅 메시지 보내기 API
     *
     * POST /api/v1/jars/{jarId}/chat/messages
     *
     * 요청 예시:
     * {
     *   "content": "안녕!"
     * }
     *
     * 응답:
     * {
     *   "data": {
     *     "messageId": 1,
     *     "jarId": 10,
     *     "senderId": 1,
     *     "senderName": "xx",
     *     "type": "TEXT",
     *     "content": "안녕!",
     *     "mine": true,
     *     "createdAt": "2026-04-24T..."
     *   }
     * }
     */
    @PostMapping("/messages")
    public ResponseEntity<ApiResponse<ChatMessageResponse>> sendMessage(
            Authentication authentication,
            @PathVariable Long jarId,
            @Valid @RequestBody ChatMessageSendRequest request
    ) {

        // 1. 현재 로그인한 사용자 ID 꺼내기
        Long currentUserId = extractCurrentUserId(authentication);

        // 2. Service에게 채팅 메시지 저장 요청하기
        ChatMessageResponse response = chatService.sendTextMessage(
                currentUserId,
                jarId,
                request
        );

        // 3. REST fallback으로 저장된 메시지도 WebSocket 구독자에게 알려준다.
        // 이렇게 해야 WebSocket이 정상 연결된 다른 사용자 화면에도 새 메시지가 바로 보인다.
        broadcastSavedMessage(jarId, response);

        // 4. 201 Created + 공통 성공 응답으로 반환하기
        return ResponseEntity
                .status(HttpStatus.CREATED)
                .body(ApiResponse.of(response));
    }

    /*
     * 기존 채팅 메시지 목록 조회 API
     *
     * GET /api/v1/jars/{jarId}/chat/messages
     * GET /api/v1/jars/{jarId}/chat/messages?beforeMessageId=100&limit=30
     *
     * beforeMessageId가 없으면:
     * - 최신 메시지부터 가져온다.
     *
     * beforeMessageId가 있으면:
     * - 해당 메시지보다 오래된 메시지를 가져온다.
     *
     * 사용 상황:
     * - 채팅방 처음 들어갔을 때
     * - 위로 스크롤해서 이전 채팅 더 보기 할 때
     */
    @GetMapping("/messages")
    public ApiResponse<ChatMessageListResponse> getMessages(
            Authentication authentication,
            @PathVariable Long jarId,
            @RequestParam(required = false) Long beforeMessageId,
            @RequestParam(required = false) Integer limit
    ) {

        // 1. 현재 로그인한 사용자 ID 꺼내기
        Long currentUserId = extractCurrentUserId(authentication);

        // 2. Service에게 채팅 목록 조회 요청하기
        ChatMessageListResponse response = chatService.getMessages(
                currentUserId,
                jarId,
                beforeMessageId,
                limit
        );

        // 3. 공통 성공 응답으로 감싸서 반환하기
        return ApiResponse.of(response);
    }

    /*
     * Polling용 새 메시지 조회 API
     *
     * GET /api/v1/jars/{jarId}/chat/messages/new?afterMessageId=100&limit=30
     *
     * afterMessageId가 100이면:
     * - 101번 이후 새 메시지만 가져온다.
     */
    @GetMapping("/messages/new")
    public ApiResponse<ChatMessageListResponse> getNewMessages(
            Authentication authentication,
            @PathVariable Long jarId,
            @RequestParam(required = false) Long afterMessageId,
            @RequestParam(required = false) Integer limit
    ) {

        // 1. 현재 로그인한 사용자 ID 꺼내기
        Long currentUserId = extractCurrentUserId(authentication);

        // 2. Service에게 새 메시지 조회 요청하기
        ChatMessageListResponse response = chatService.getNewMessages(
                currentUserId,
                jarId,
                afterMessageId,
                limit
        );

        // 3. 공통 성공 응답으로 감싸서 반환하기
        return ApiResponse.of(response);
    }

    /*
     * 채팅 읽음 처리 API
     *
     * POST /api/v1/jars/{jarId}/chat/read
     *
     * 요청 예시:
     * {
     *   "lastReadMessageId": 25
     * }
     *
     * 의미:
     * - "나는 25번 메시지까지 읽었어"라고 서버에 알려주는 API다.
     *
     * 이 값이 저장되어야 unread count를 계산할 수 있다.
     */
    @PostMapping("/read")
    public ApiResponse<Map<String, Boolean>> markAsRead(
            Authentication authentication,
            @PathVariable Long jarId,
            @Valid @RequestBody ChatReadRequest request
    ) {

        // 1. 현재 로그인한 사용자 ID 꺼내기
        Long currentUserId = extractCurrentUserId(authentication);

        // 2. Service에게 읽음 처리 요청하기
        chatService.markAsRead(
                currentUserId,
                jarId,
                request
        );

        // 3. 읽음 처리가 성공했다는 간단한 응답 반환하기
        return ApiResponse.of(Map.of("ok", true));
    }

    /*
     * 안 읽은 채팅 개수 조회 API
     *
     * GET /api/v1/jars/{jarId}/chat/unread
     *
     * 응답 예시:
     * {
     *   "data": {
     *     "jarId": 10,
     *     "unreadCount": 3
     *   }
     * }
     *
     * 사용 상황:
     * - 저금통 상세 화면의 채팅 버튼 옆 뱃지
     * - 저금통 목록 카드의 안 읽은 채팅 표시
     */
    @GetMapping("/unread")
    public ApiResponse<ChatUnreadResponse> getUnreadCount(
            Authentication authentication,
            @PathVariable Long jarId
    ) {

        // 1. 현재 로그인한 사용자 ID 꺼내기
        Long currentUserId = extractCurrentUserId(authentication);

        // 2. Service에게 unread count 조회 요청하기
        ChatUnreadResponse response = chatService.getUnreadCount(
                currentUserId,
                jarId
        );

        // 3. 공통 성공 응답으로 감싸서 반환하기
        return ApiResponse.of(response);
    }

    /*
     * 현재 로그인한 사용자 ID를 Authentication에서 꺼내는 메서드
     *
     * 현재 프로젝트는 JWT 필터에서 인증 정보를 만들 때
     * principal 안에 Map 형태로 userId를 넣는 구조를 사용한다.
     *
     * 그래서 Controller에서는 authentication.getPrincipal()에서
     * userId를 꺼내서 Long으로 변환한다.
     */
    private Long extractCurrentUserId(Authentication authentication) {
        // 인증 정보 자체가 없으면 로그인하지 않은 상태다.
        if (authentication == null) {
            throw new ResponseStatusException(
                    UNAUTHORIZED,
                    "인증이 필요합니다."
            );
        }

        // Spring Security가 들고 있는 로그인 사용자 정보 꺼내기
        Object principal = authentication.getPrincipal();

        // 현재 프로젝트 기준 principal은 Map 형태다.
        if (principal instanceof Map map) {
            // Map 안에서 userId 값 꺼내기
            Object userIdValue = map.get("userId");

            // userId가 Long이면 그대로 사용한다.
            if (userIdValue instanceof Long userId) {
                return userId;
            }

            // userId가 Integer면 Long으로 바꿔서 사용한다.
            if (userIdValue instanceof Integer userId) {
                return userId.longValue();
            }

            // userId가 String이면 숫자로 바꿔서 사용한다.
            if (userIdValue instanceof String userId) {
                try {
                    return Long.parseLong(userId);
                } catch (NumberFormatException e) {
                    throw new ResponseStatusException(
                            UNAUTHORIZED,
                            "userId 형식이 올바르지 않습니다."
                    );
                }
            }
        }

        throw new ResponseStatusException(
                UNAUTHORIZED,
                "인증 사용자 정보를 읽을 수 없습니다."
        );
    }

    /*
     * REST fallback으로 저장된 메시지를 WebSocket 채팅방에 방송한다.
     *
     * 예를 들어 A 사용자의 WebSocket이 끊겨 REST로 메시지를 보냈더라도,
     * B 사용자가 /topic/jars/{jarId}/chat 을 구독 중이면 이 메시지를 바로 받을 수 있다.
     */
    private void broadcastSavedMessage(Long jarId, ChatMessageResponse response) {
        // REST 응답 DTO에는 mine 값이 들어있다.
        // WebSocket은 모든 사용자에게 같은 메시지를 보내므로 mine 값을 뺀 DTO로 바꿔서 보낸다.
        ChatSocketMessageResponse socketMessage = ChatSocketMessageResponse.from(response);

        // 같은 저금통 채팅방을 구독 중인 사용자들에게 새 메시지를 방송한다.
        messagingTemplate.convertAndSend(
                "/topic/jars/" + jarId + "/chat",
                socketMessage
        );
    }
}