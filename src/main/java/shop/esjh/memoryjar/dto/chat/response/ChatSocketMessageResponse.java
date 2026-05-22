package shop.esjh.memoryjar.dto.chat.response;

import shop.esjh.memoryjar.enums.chat.ChatMessageType;

import java.time.LocalDateTime;

/*
 * 이 DTO는 WebSocket으로 채팅 메시지를 실시간 전송할 때 사용하는 응답 모양이다.
 *
 * REST 응답 DTO인 ChatMessageResponse에는 mine 값이 있다.
 * 하지만 WebSocket은 같은 메시지를 모든 사람에게 뿌리기 때문에
 * mine 값을 서버에서 고정해서 보내면 다른 사람 화면에서 오류가 날 수 있다.
 *
 * 그래서 WebSocket 응답에서는 mine을 빼고,
 * 프론트에서 senderId와 현재 로그인한 사용자 ID를 비교해서 mine을 계산하게 한다.
 */
public record ChatSocketMessageResponse(

        // 채팅 메시지 고유 ID
        Long messageId,

        // 이 메시지가 속한 저금통 ID
        Long jarId,

        // 보낸 사람 ID
        Long senderId,

        // 보낸 사람 이름
        String senderName,

        // 메시지 종류
        // 지금 v1에서는 TEXT 중심으로 사용
        ChatMessageType type,

        // 실제 채팅 내용
        String content,

        // 메시지가 만들어진 시간
        LocalDateTime createdAt
) {

    /*
     * 기존 ChatService가 만들어준 ChatMessageResponse를
     * WebSocket 전송용 DTO로 바꿔주는 메서드다.
     *
     * 핵심:
     * - DB 저장 로직은 기존 ChatService를 그대로 재사용한다.
     * - WebSocket으로 뿌릴 때만 mine 값을 제외한다.
     */
    public static ChatSocketMessageResponse from(ChatMessageResponse response) {
        return new ChatSocketMessageResponse(
                response.messageId(),
                response.jarId(),
                response.senderId(),
                response.senderName(),
                response.type(),
                response.content(),
                response.createdAt()
        );
    }
}