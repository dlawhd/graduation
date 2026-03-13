package com.example.demo.security;

import com.example.demo.dto.reponse.ErrorResponse;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.security.web.access.AccessDeniedHandler;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

@Component
@RequiredArgsConstructor
public class SecurityErrorHandler implements AuthenticationEntryPoint, AccessDeniedHandler {

    private final ObjectMapper objectMapper;

    @Override
    public void commence(
            HttpServletRequest request,
            HttpServletResponse response,
            org.springframework.security.core.AuthenticationException authException
    ) throws IOException, ServletException {
        writeError(
                response,
                HttpServletResponse.SC_UNAUTHORIZED,
                ErrorResponse.of(
                        "UNAUTHORIZED",
                        "로그인이 필요합니다.",
                        request.getRequestURI()
                )
        );
    }

    @Override
    public void handle(
            HttpServletRequest request,
            HttpServletResponse response,
            AccessDeniedException accessDeniedException
    ) throws IOException, ServletException {
        writeError(
                response,
                HttpServletResponse.SC_FORBIDDEN,
                ErrorResponse.of(
                        "FORBIDDEN",
                        "접근 권한이 없습니다.",
                        request.getRequestURI()
                )
        );
    }

    private void writeError(
            HttpServletResponse response,
            int status,
            ErrorResponse errorResponse
    ) throws IOException {
        response.setStatus(status);
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());

        objectMapper.writeValue(response.getWriter(), errorResponse);
    }
}