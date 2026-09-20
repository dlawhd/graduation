package shop.esjh.memoryjar.config.exception;

import lombok.extern.slf4j.Slf4j;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.servlet.resource.NoResourceFoundException;
import shop.esjh.memoryjar.dto.response.ErrorEnvelope;
import shop.esjh.memoryjar.dto.response.ErrorResponse;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.multipart.support.MissingServletRequestPartException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import jakarta.validation.ConstraintViolationException;
import org.springframework.web.HttpMediaTypeNotSupportedException;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.server.ResponseStatusException;

// 컨트롤러나 서비스에서 에러가 나면 이 클래스가 그 에러를 대신 받아서 사용자에게 보기 좋은 형태(JSON)로 정리해서 보냄
@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler {

    /** 기능 Service가 정한 코드·HTTP 상태·기본 문구를 변경하지 않고 공통 JSON 봉투로 반환한다. */
    @ExceptionHandler(ApiException.class)
    public ResponseEntity<ErrorEnvelope> handleApiException(ApiException ex, HttpServletRequest request) {
        ErrorCode errorCode = ex.getErrorCode();
        return ResponseEntity.status(errorCode.status()).body(ErrorEnvelope.of(
                ErrorResponse.of(errorCode.code(), errorCode.message(), request.getRequestURI())));
    }

    // ✅ IllegalArgumentException(주로 잘못된 값이 들어왔을 때 많이 사용하는 예외) 처리
    // 이 예외가 발생하면 BAD_REQUEST(400) 형태의 에러 응답으로 바꿔서 내림.
    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<ErrorEnvelope> handleIllegalArgument(
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
        return ResponseEntity.badRequest().body(ErrorEnvelope.of(error));
    }

    // ✅ ResponseStatusException(이 예외는 상태코드까지 같이 담아서 던질 수 있는 예외) 처리
    // 상태코드(401, 403, 404 등)를 꺼내고 그에 맞는 code 문자열을 만들고 reason(설명 메시지)이 있으면 그걸 사용하고
    // 없으면 기본 메시지를 넣어줌
    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<ErrorEnvelope> handleResponseStatusException(
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

        return ResponseEntity.status(statusCode).body(ErrorEnvelope.of(error));
    }

    /*
     * 요청 JSON을 읽지 못했을 때 처리하는 예외 핸들러
     *
     * 예를 들어:
     * - 존재하지 않는 테마인 COUPLE을 보낸 경우
     * - 잘못된 날짜 형식을 보낸 경우
     * - JSON 문법이 깨진 경우
     *
     * 이런 요청은 서버 자체의 문제가 아니라
     * 클라이언트가 보낸 값의 형식 문제이므로 500이 아니라 400을 반환한다.
     */
    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<ErrorEnvelope> handleHttpMessageNotReadable(
            HttpMessageNotReadableException ex,
            HttpServletRequest request
    ) {
        ErrorResponse error = ErrorResponse.of(
                "BAD_REQUEST",
                "요청 값의 형식이 올바르지 않습니다. 테마나 날짜 값을 확인해 주세요.",
                request.getRequestURI()
        );

        return ResponseEntity.badRequest()
                .body(ErrorEnvelope.of(error));
    }

    /*
     * 요청한 Controller/API 경로 자체가 존재하지 않는 경우
     *
     * 서버 내부 장애가 아니라
     * 존재하지 않는 주소이므로 404로 응답한다.
     */
    @ExceptionHandler(
            NoResourceFoundException.class
    )
    public ResponseEntity<ErrorEnvelope>
    handleNoResourceFound(
            NoResourceFoundException ex,
            HttpServletRequest request
    ) {

        ErrorResponse error =
                ErrorResponse.of(
                        "NOT_FOUND",
                        "요청한 API를 찾을 수 없습니다.",
                        request.getRequestURI()
                );

        return ResponseEntity
                .status(
                        HttpStatus.NOT_FOUND
                )
                .body(
                        ErrorEnvelope.of(
                                error
                        )
                );
    }

    // ✅ 그 밖의 모든 예외 처리
    @ExceptionHandler(Exception.class)
    public ResponseEntity<ErrorEnvelope> handleException(
            Exception ex,
            HttpServletRequest request
    ) {

        // 예상하지 못한 서버 에러는 반드시 로그로 남긴다.
        // ex를 같이 넘겨야 어느 파일, 몇 번째 줄에서 터졌는지까지 확인할 수 있다.
        log.error("Unhandled exception occurred. path={}", request.getRequestURI(), ex);

        ErrorResponse error = ErrorResponse.of(
                "INTERNAL_SERVER_ERROR",
                "서버 내부 오류가 발생했습니다.",
                request.getRequestURI()
        );

        // ✅ HTTP 500 상태코드와 함께 응답 반환
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(ErrorEnvelope.of(error));
    }

    // ✅ @Valid 검증 실패 처리
// 예: fileName이 비어 있거나, size가 0 이하일 때 발생
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ErrorEnvelope> handleMethodArgumentNotValid(
            MethodArgumentNotValidException ex,
            HttpServletRequest request
    ) {
        // 여러 필드 에러가 있을 수 있지만 지금은 가장 첫 번째 에러 메시지를 대표 메시지로 내려줌
        String message = ex.getBindingResult()
                .getFieldErrors()
                .stream()
                .findFirst()
                .map(fieldError -> fieldError.getDefaultMessage())
                .orElse("잘못된 요청입니다.");

        ErrorResponse error = ErrorResponse.of(
                "BAD_REQUEST",
                message,
                request.getRequestURI()
        );

        return ResponseEntity.badRequest().body(ErrorEnvelope.of(error));
    }

    /** URL 파라미터·경로 변수 검증과 숫자 형식 오류도 서버 오류가 아닌 400으로 통일한다. */
    @ExceptionHandler({ConstraintViolationException.class, MethodArgumentTypeMismatchException.class})
    public ResponseEntity<ErrorEnvelope> handleParameterValidation(Exception ex, HttpServletRequest request) {
        return error(HttpStatus.BAD_REQUEST, "BAD_REQUEST", "요청 값이 올바르지 않습니다.", request);
    }

    /** multipart 이미지가 빠졌거나 형식이 맞지 않는 요청을 명확한 4xx로 반환한다. */
    @ExceptionHandler({MissingServletRequestPartException.class, HttpMediaTypeNotSupportedException.class})
    public ResponseEntity<ErrorEnvelope> handleMultipartRequest(Exception ex, HttpServletRequest request) {
        return error(HttpStatus.BAD_REQUEST, "BAD_REQUEST", "요청 파일 또는 형식이 올바르지 않습니다.", request);
    }

    @ExceptionHandler(MaxUploadSizeExceededException.class)
    public ResponseEntity<ErrorEnvelope> handleMaxUploadSize(MaxUploadSizeExceededException ex, HttpServletRequest request) {
        return error(HttpStatus.PAYLOAD_TOO_LARGE, "PAYLOAD_TOO_LARGE", "업로드 파일 크기가 허용 범위를 초과했습니다.", request);
    }

    private ResponseEntity<ErrorEnvelope> error(HttpStatus status, String code, String message, HttpServletRequest request) {
        return ResponseEntity.status(status).body(ErrorEnvelope.of(ErrorResponse.of(code, message, request.getRequestURI())));
    }

    // ✅ 상태코드 숫자를 에러 코드 문자열로 바꾸는 메서드
    private String statusToCode(int status) {
        return switch (status) {
            case 400 -> "BAD_REQUEST";
            case 401 -> "UNAUTHORIZED";
            case 403 -> "FORBIDDEN";
            case 404 -> "NOT_FOUND";
            case 409 -> "CONFLICT";
            case 413 -> "PAYLOAD_TOO_LARGE";
            case 415 -> "UNSUPPORTED_MEDIA_TYPE";
            case 429 -> "TOO_MANY_REQUESTS";
            case 502 -> "BAD_GATEWAY";
            case 503 -> "SERVICE_UNAVAILABLE";

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
            case 409 -> "현재 상태에서는 요청을 처리할 수 없습니다.";
            case 413 -> "요청 크기가 허용 범위를 초과했습니다.";
            case 415 -> "지원하지 않는 요청 형식입니다.";
            case 429 -> "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.";
            case 502 -> "외부 서비스와 통신하지 못했습니다.";
            case 503 -> "서비스 설정 또는 상태가 준비되지 않았습니다.";
            default -> "요청 처리 중 오류가 발생했습니다.";
        };
    }
}
