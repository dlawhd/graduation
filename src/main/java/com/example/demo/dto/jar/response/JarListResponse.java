package com.example.demo.dto.jar.response;

import java.util.List;

// 내가 속한 저금통 목록 전체를 감싸는 응답
public record JarListResponse(
        List<JarListItem> items,
        int page,
        int size,
        long totalElements,
        int totalPages
) {
}