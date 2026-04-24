package com.example.demo.dto.chat.request;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

// 사용자가 채팅방에서 어디까지 읽었는지 서버에 알려주는 요청 DTO
public record ChatReadRequest(

        // 마지막으로 읽은 메시지 ID
        // 예: lastReadMessageId = 25
        @NotNull(message = "마지막으로 읽은 메시지 ID는 필수예요.")

        // 메시지 ID는 1 이상이어야 한다.
        @Positive(message = "마지막으로 읽은 메시지 ID는 1 이상이어야 해요.")
        Long lastReadMessageId
) {
}