package com.example.demo.dto.response;

public record CsrfResponse(
        String headerName,
        String parameterName,
        String token
) {}