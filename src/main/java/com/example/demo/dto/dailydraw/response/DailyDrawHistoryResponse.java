package com.example.demo.dto.dailydraw.response;

import java.util.List;

/*
 * DailyDrawHistoryResponse
 *
 * 이 DTO는 Daily Draw 히스토리 목록 전체를 내려주는 역할을 한다.
 *
 * 기존 NoteListResponse, NotificationListResponse처럼
 * items + page + size + totalElements + totalPages 구조로 맞춘다.
 */
public record DailyDrawHistoryResponse(

        // Daily Draw 히스토리 목록
        List<DailyDrawHistoryItem> items,

        // 현재 페이지 번호
        int page,

        // 한 페이지 크기
        int size,

        // 전체 히스토리 개수
        long totalElements,

        // 전체 페이지 수
        int totalPages
) {
}