package com.example.demo.dto.reponse;

import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import org.slf4j.MDC;

import java.time.LocalDateTime;

@Getter
@Builder
@AllArgsConstructor(access = AccessLevel.PRIVATE)
public class ErrorResponse {

    private final String code;
    private final String message;
    private final String path;
    private final String traceId;
    private final LocalDateTime timestamp;

    public static ErrorResponse of(String code, String message, String path) {
        return ErrorResponse.builder()
                .code(code)
                .message(message)
                .path(path)
                .traceId(MDC.get("traceId"))
                .timestamp(LocalDateTime.now())
                .build();
    }
}