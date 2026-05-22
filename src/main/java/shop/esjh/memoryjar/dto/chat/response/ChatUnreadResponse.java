package shop.esjh.memoryjar.dto.chat.response;

// 특정 저금통 채팅방의 안 읽은 메시지 개수를 내려주는 응답 DTO
public record ChatUnreadResponse(

        // 저금통 ID
        Long jarId,

        // 안 읽은 메시지 개수
        long unreadCount
) {
}