package com.example.demo.controller.chat;

import com.example.demo.dto.chat.request.ChatMessageSendRequest;
import com.example.demo.dto.chat.response.ChatMessageResponse;
import com.example.demo.dto.chat.response.ChatSocketMessageResponse;
import com.example.demo.service.chat.ChatService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.messaging.handler.annotation.DestinationVariable;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Controller;
import org.springframework.web.server.ResponseStatusException;

import java.security.Principal;
import java.util.Map;

/*
 * ChatSocketController 역할
 *
 * 이 컨트롤러는 WebSocket으로 들어온 저금통 채팅 메시지를 처리한다.
 *
 * 쉽게 말하면:
 * - 프론트가 /app/jars/{jarId}/chat.send 로 메시지를 보낸다.
 * - 서버는 기존 ChatService를 사용해서 메시지를 DB에 저장한다.
 * - 저장된 메시지를 /topic/jars/{jarId}/chat 을 구독 중인 사용자들에게 뿌린다.
 *
 * 중요한 점:
 * - 채팅 저장 규칙은 새로 만들지 않는다. => 새로운 서비스를 만들지 않는다.
 * - REST 채팅과 똑같이 ChatService.sendTextMessage()를 재사용한다.
 */
@Controller
public class ChatSocketController {

    // 기존 채팅 저장/검증 로직을 그대로 사용하기 위한 서비스
    private final ChatService chatService;

    // 특정 topic을 구독 중인 사용자들에게 메시지를 보내기 위한 도구
    private final SimpMessagingTemplate messagingTemplate;

    public ChatSocketController(
            ChatService chatService,
            SimpMessagingTemplate messagingTemplate
    ) {
        this.chatService = chatService;
        this.messagingTemplate = messagingTemplate;
    }

    /*
     * WebSocket 채팅 메시지 전송 처리
     *
     * 프론트에서 보내는 주소:
     * /app/jars/{jarId}/chat.send
     *
     * 실제 예시:
     * /app/jars/36/chat.send
     *
     * 서버가 뿌리는 주소:
     * /topic/jars/{jarId}/chat
     *
     * 실제 예시:
     * /topic/jars/36/chat
     */
    @MessageMapping("/jars/{jarId}/chat.send")
    public void sendMessage(

            // WebSocket 주소 안에 들어있는 jarId를 꺼낸다.
            @DestinationVariable
            Long jarId,

            // 프론트가 보낸 채팅 메시지 본문을 받는다.
            // ChatMessageSendRequest 안의 content 검증도 함께 실행된다.
            @Valid
            @Payload
            ChatMessageSendRequest request,

            // WebSocket 연결 시점에 인증된 사용자 정보다.
            Principal principal
    ) {

        // 1. 현재 로그인한 사용자 ID를 꺼낸다.
        Long currentUserId = extractCurrentUserId(principal);

        // 2. 기존 ChatService로 메시지를 저장한다.
        // 여기서 멤버 검증, 빈 메시지 검증, DB 저장이 모두 처리된다.
        ChatMessageResponse savedMessage = chatService.sendTextMessage(
                currentUserId,
                jarId,
                request
        );

        // 3. WebSocket 전송용 응답으로 바꾼다.
        // mine 값은 빼고 보낸다.
        ChatSocketMessageResponse socketMessage =
                ChatSocketMessageResponse.from(savedMessage);

        // 4. 같은 저금통 채팅방을 보고 있는 사람들에게 메시지를 뿌린다.
        messagingTemplate.convertAndSend(
                "/topic/jars/" + jarId + "/chat",
                socketMessage
        );
    }

    /*
     * WebSocket Principal에서 현재 로그인한 사용자 ID를 꺼내는 메서드다.
     *
     * 현재 프로젝트는 JWT 인증 후 principal 안에 Map 형태로 userId를 넣고 있다.
     * JwtAuthenticationFilter에서도 principal.put("userId", userId) 형태로 저장한다.
     */
    private Long extractCurrentUserId(Principal principal) {
        // 인증 정보가 없으면 로그인하지 않은 사용자다.
        if (principal == null) {
            throw new ResponseStatusException(
                    HttpStatus.UNAUTHORIZED,
                    "인증이 필요합니다."
            );
        }

        // Spring Security의 Authentication은 Principal을 상속한다.
        if (principal instanceof Authentication authentication) {
            Object authenticationPrincipal = authentication.getPrincipal();

            // 현재 프로젝트 기준 principal은 Map 형태다.
            if (authenticationPrincipal instanceof Map<?, ?> map) {
                Object userIdValue = map.get("userId");

                // userId가 Number 타입이면 Long으로 바꾼다.
                if (userIdValue instanceof Number number) {
                    return number.longValue();
                }

                // 현재 JwtAuthenticationFilter에서는 subject를 String으로 넣고 있으므로
                // String 타입도 Long으로 변환해준다.
                if (userIdValue instanceof String userIdText) {
                    return Long.parseLong(userIdText);
                }
            }
        }

        // 여기까지 왔다는 것은 인증 구조가 예상과 다르다는 뜻이다.
        throw new ResponseStatusException(
                HttpStatus.UNAUTHORIZED,
                "인증 정보를 확인할 수 없습니다."
        );
    }
}