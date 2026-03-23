package com.example.demo.dto.jar.response;

import java.util.List;

// 초대코드 목록 전체를 담는 응답
public record JarInviteListResponse(
        List<JarInviteItem> items
) {
}