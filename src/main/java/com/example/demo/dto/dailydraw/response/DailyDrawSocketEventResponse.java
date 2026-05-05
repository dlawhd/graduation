package com.example.demo.dto.dailydraw.response;

import java.time.LocalDate;

public record DailyDrawSocketEventResponse(
        Long jarId,
        String eventType,
        Long drawId,
        LocalDate drawDate,
        Long noteId,
        String message
) {}