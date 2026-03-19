package com.example.demo.dto.response;

public record ErrorEnvelope(ErrorResponse error) {
    public static ErrorEnvelope of(ErrorResponse error) {
        return new ErrorEnvelope(error);
    }
}