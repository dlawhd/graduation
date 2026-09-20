package shop.esjh.memoryjar.config.exception;

import org.springframework.http.HttpStatus;

/** 기능별 오류가 HTTP 상태와 프론트용 안정적인 식별 코드를 함께 제공하는 계약이다. */
public interface ErrorCode {
    String code();
    HttpStatus status();
    String message();
}
