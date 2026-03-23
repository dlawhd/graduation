package com.example.demo.dto.jar.response;

import java.time.OffsetDateTime;

// 저금통 수정이 끝난 뒤 돌려주는 응답
public record JarUpdateResponse(
        Long jarId,
        OffsetDateTime updatedAt
) {
}
