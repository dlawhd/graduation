package com.example.demo.dto.reponse;

import lombok.AllArgsConstructor;
import lombok.Getter;

import java.time.LocalDateTime;

@Getter
@AllArgsConstructor
public class ErrorResponse {
    private String code;      // 예: AUTH_001
    private String message;   // 사용자에게 보여줄 메시지
    private String path;      // 요청 주소
    private String traceId;   // 로그 추적용
    private LocalDateTime timestamp;
}