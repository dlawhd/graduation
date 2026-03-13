package com.example.demo.config.exception;

import com.example.demo.dto.reponse.ErrorResponse;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.server.ResponseStatusException;

// 컨트롤러나 서비스에서 에러가 나면 이 클래스가 그 에러를 대신 받아서 사용자에게 보기 좋은 형태(JSON)로 정리해서 보냄
@RestControllerAdvice
public class GlobalExceptionHandler {

    // ✅ IllegalArgumentException(주로 잘못된 값이 들어왔을 때 많이 사용하는 예외) 처리
    // 이 예외가 발생하면 BAD_REQUEST(400) 형태의 에러 응답으로 바꿔서 내림.
    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<ErrorResponse> handleIllegalArgument(
            IllegalArgumentException ex,
            HttpServletRequest request
    ) {
        // code: 에러 종류, message: 실제 에러 메시지, path: 어떤 URL에서 에러가 났는지
        ErrorResponse error = ErrorResponse.of(
                "BAD_REQUEST",
                ex.getMessage(),
                request.getRequestURI()
        );

        // ✅ HTTP 400 상태코드와 함께 응답 반환
        return ResponseEntity.badRequest().body(error);
    }

    // ✅ ResponseStatusException(이 예외는 상태코드까지 같이 담아서 던질 수 있는 예외) 처리
    // 상태코드(401, 403, 404 등)를 꺼내고 그에 맞는 code 문자열을 만들고 reason(설명 메시지)이 있으면 그걸 사용하고
    // 없으면 기본 메시지를 넣어줌
    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<ErrorResponse> handleResponseStatusException(
            ResponseStatusException ex,
            HttpServletRequest request
    ) {
        // ✅ 예외 안에 들어 있는 HTTP 상태코드 꺼내기
        HttpStatusCode statusCode = ex.getStatusCode();

        // ✅ 숫자 상태코드를 문자열 code로 변환, 예: 401 -> "UNAUTHORIZED"
        String code = statusToCode(statusCode.value());

        // ✅ 예외에 reason(설명 메시지)이 있으면 그걸 사용, 없으면 상태코드에 맞는 기본 메시지 사용
        String message = ex.getReason() != null
                ? ex.getReason()
                : defaultMessage(statusCode.value());

        ErrorResponse error = ErrorResponse.of(
                code,
                message,
                request.getRequestURI()
        );

        return ResponseEntity.status(statusCode).body(error);
    }

    // ✅ 그 밖의 모든 예외 처리
    @ExceptionHandler(Exception.class)
    public ResponseEntity<ErrorResponse> handleException(
            Exception ex,
            HttpServletRequest request
    ) {
        ErrorResponse error = ErrorResponse.of(
                "INTERNAL_SERVER_ERROR",
                "서버 내부 오류가 발생했습니다.",
                request.getRequestURI()
        );

        // ✅ HTTP 500 상태코드와 함께 응답 반환
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(error);
    }

    // ✅ 상태코드 숫자를 에러 코드 문자열로 바꾸는 메서드
    private String statusToCode(int status) {
        return switch (status) {
            case 400 -> "BAD_REQUEST";
            case 401 -> "UNAUTHORIZED";
            case 403 -> "FORBIDDEN";
            case 404 -> "NOT_FOUND";

            // 나머지는 HTTP_상태코드 형태로 만들어 줌
            default -> "HTTP_" + status;
        };
    }

    // ✅ 상태코드 숫자에 맞는 기본 메시지를 만드는 메서드
    // ResponseStatusException에서 reason이 비어 있으면 이 기본 메시지를 대신 사용
    private String defaultMessage(int status) {
        return switch (status) {
            case 400 -> "잘못된 요청입니다.";
            case 401 -> "인증이 필요합니다.";
            case 403 -> "접근 권한이 없습니다.";
            case 404 -> "대상을 찾을 수 없습니다.";
            default -> "요청 처리 중 오류가 발생했습니다.";
        };
    }
}