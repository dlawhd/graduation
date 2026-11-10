package shop.esjh.memoryjar.config.exception;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.core.annotation.Order;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import shop.esjh.memoryjar.dto.response.*;
import shop.esjh.memoryjar.security.OperatorMfaRequiredException;

/** 추가 인증 필요 응답을 별도 코드로 전달해 문의 화면만 잠그고 일반 로그인은 유지한다. */
@RestControllerAdvice
@Order(-1)
public class OperatorMfaExceptionHandler {
    @ExceptionHandler(OperatorMfaRequiredException.class)
    public ResponseEntity<ErrorEnvelope> required(OperatorMfaRequiredException error, HttpServletRequest request) {
        return ResponseEntity.status(403).header("Cache-Control", "no-store").body(ErrorEnvelope.of(
                ErrorResponse.of("OPERATOR_MFA_REQUIRED", error.getReason(), request.getRequestURI())));
    }
}
