package com.example.demo.dto.dailydraw.response;

import java.time.LocalDate;

// "오늘의 추억 한 장 뽑기" 결과를 내려주는 역할
public record DailyDrawResponse(

        // Daily Draw 기록 번호
        Long drawId,

        // 저금통 번호
        Long jarId,

        // 오늘 카드 날짜
        // 예: 2026-05-04
        LocalDate drawDate,

        // true  = 이번 요청에서 새로 뽑힘
        // false = 이미 오늘 뽑힌 카드가 있어서 기존 카드를 반환함
        boolean newlyDrawn,

        // 오늘의 추억 한 장으로 뽑힌 쪽지 정보
        DailyDrawNoteResponse note
) {
}