package shop.esjh.memoryjar.config.exception;

/** Service가 사용자에게 알려 줄 기능별 오류 코드를 전역 응답 계층으로 전달한다. */
public class ApiException extends RuntimeException {
    private final ErrorCode errorCode;

    public ApiException(ErrorCode errorCode) {
        super(errorCode.message());
        this.errorCode = errorCode;
    }

    public ErrorCode getErrorCode() {
        return errorCode;
    }
}
