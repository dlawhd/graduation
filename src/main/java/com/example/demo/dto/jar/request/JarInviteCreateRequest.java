package com.example.demo.dto.jar.request;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

// 초대코드를 만들 때 보내는 요청
// 몇 시간 동안 쓸 수 있고, 몇 번까지 쓸 수 있는 초대장인지
public record JarInviteCreateRequest(

        // 초대장 유효 시간(시간 단위)
        // 최소 1시간, 최대 168시간(7일)
        @Min(1)
        @Max(168)
        Integer expiresInHours,

        // 최대 사용 횟수
        // 최소 1번, 최대 50번
        @Min(1)
        @Max(50)
        Integer maxUses
) {
}