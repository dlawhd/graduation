package com.example.demo.dto.chat.response;

import java.util.List;

// 채팅 메시지 목록을 프론트로 내려줄 때 사용하는 응답 DTO
public record ChatMessageListResponse(

        // 채팅 메시지 목록
        List<ChatMessageResponse> items,

        // 이전 메시지가 더 있는지 여부
        boolean hasNext,

        // 다음 이전 조회에 사용할 커서
        Long nextBeforeMessageId
) {

    // Service에서 응답을 읽기 쉽게 만들기 위한 정적 생성 메서드
    public static ChatMessageListResponse of(
            List<ChatMessageResponse> items,
            boolean hasNext,
            Long nextBeforeMessageId
    ) {
        return new ChatMessageListResponse(items, hasNext, nextBeforeMessageId);
    }
}