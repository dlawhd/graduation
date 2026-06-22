package shop.esjh.memoryjar.dto.chat.response;

import java.util.List;

// 채팅 메시지 목록을 프론트로 내려줄 때 사용하는 응답 DTO
public record ChatMessageListResponse(

        // 채팅 메시지 목록
        List<ChatMessageResponse> items,

        // 이전 메시지가 더 있는지 여부
        boolean hasNext,

        // 다음 이전 조회에 사용할 커서
        Long nextBeforeMessageId,

        // 사용자가 마지막으로 읽은 메시지 ID
        // 채팅방을 처음 열었을 때 첫 번째 안 읽은 메시지 위치를 찾기 위해 사용한다.
        Long lastReadMessageId,

        // 첫 번째 안 읽은 메시지 ID
        // 프론트는 이 ID를 가진 메시지 위치로 스크롤하면 된다.
        Long firstUnreadMessageId
) {

    // 기존 목록/새 메시지 응답에서 사용하던 기본 생성 메서드
    public static ChatMessageListResponse of(
            List<ChatMessageResponse> items,
            boolean hasNext,
            Long nextBeforeMessageId
    ) {
        return new ChatMessageListResponse(
                items,
                hasNext,
                nextBeforeMessageId,
                null,
                null
        );
    }

    // 채팅방 첫 진입처럼 읽음 위치 정보가 필요한 경우 사용하는 생성 메서드
    public static ChatMessageListResponse of(
            List<ChatMessageResponse> items,
            boolean hasNext,
            Long nextBeforeMessageId,
            Long lastReadMessageId,
            Long firstUnreadMessageId
    ) {
        return new ChatMessageListResponse(
                items,
                hasNext,
                nextBeforeMessageId,
                lastReadMessageId,
                firstUnreadMessageId
        );
    }
}