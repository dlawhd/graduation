package com.example.demo.config.exception;

import com.example.demo.dto.reponse.ErrorResponse;
import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.MDC;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.time.LocalDateTime;

@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<ErrorResponse> handleBadRequest(
            IllegalArgumentException e,
            HttpServletRequest req
    ) {
        String traceId = MDC.get("traceId");
        return ResponseEntity.badRequest().body(
                new ErrorResponse(
                        "COMMON_400",
                        e.getMessage(),
                        req.getRequestURI(),
                        traceId,
                        LocalDateTime.now()
                )
        );
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ErrorResponse> handleServerError(
            Exception e,
            HttpServletRequest req
    ) {
        String traceId = MDC.get("traceId");
        return ResponseEntity.status(500).body(
                new ErrorResponse(
                        "COMMON_500",
                        "서버에 잠깐 문제가 생겼어요.",
                        req.getRequestURI(),
                        traceId,
                        LocalDateTime.now()
                )
        );
    }
}