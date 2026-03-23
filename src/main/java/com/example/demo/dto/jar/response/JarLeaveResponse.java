package com.example.demo.dto.jar.response;

import java.time.OffsetDateTime;

// 어느 저금통에서, 언제 나갔는지
public record JarLeaveResponse(
        Long jarId,
        OffsetDateTime leftAt
) {
}