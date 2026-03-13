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

// Spring Security에서 발생하는 보안 관련 에러를 우리가 정한 JSON 형식으로 바꿔서 응답해줌
@Component
@RequiredArgsConstructor
public class SecurityErrorHandler implements AuthenticationEntryPoint, AccessDeniedHandler {

    // ✅ 자바 객체를 JSON 문자열로 바꿔주는 도구
    private final ObjectMapper objectMapper;

    // ✅ 로그인하지 않은 사용자가 인증이 필요한 API에 접근했을 때 호출
    @Override
    public void commence(
            HttpServletRequest request,
            HttpServletResponse response,
            org.springframework.security.core.AuthenticationException authException
    ) throws IOException, ServletException {
        // ✅ writeError()를 호출해서 401 상태코드 + ErrorResponse JSON 응답을 만들어서 내려줌
        writeError(
                response,
                HttpServletResponse.SC_UNAUTHORIZED,
                ErrorResponse.of(
                        "UNAUTHORIZED",             // 에러 코드
                        "로그인이 필요합니다.",              // 사용자에게 보여줄 메시지
                        request.getRequestURI()          // 어떤 주소에서 에러가 났는지
                )
        );
    }

    // ✅ 로그인은 되어 있지만, 해당 API에 접근할 권한이 없을 때 호출
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

    // ✅ 실제로 HTTP 응답을 만드는 공통 메서드
    private void writeError(
            HttpServletResponse response,
            int status,
            ErrorResponse errorResponse
    ) throws IOException {

        // ✅ HTTP 상태코드 설정
        response.setStatus(status);

        // ✅ 응답 데이터 형식을 JSON으로 지정
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);

        // ✅ 한글이 깨지지 않도록 UTF-8 설정
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());

        // ✅ ErrorResponse 객체를 JSON으로 바꿔서 응답 바디에 써줌
        objectMapper.writeValue(response.getWriter(), errorResponse);
    }
}