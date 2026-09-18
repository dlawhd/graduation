package shop.esjh.memoryjar.enums.ai;

/**
 * AI 후보 생성이 실패했을 때 재시도와 운영 분석에 사용하는 원인 코드다.
 */
public enum JarAiGenerationErrorCode {
    SOURCE_IMAGE_LOAD_FAILED,
    PROVIDER_REQUEST_FAILED,
    PROVIDER_TIMEOUT,
    PROVIDER_RATE_LIMITED,
    PROVIDER_INVALID_RESPONSE,
    PIXEL_POSTPROCESS_FAILED,
    S3_UPLOAD_FAILED,
    GENERATION_TIMEOUT,
    INTERNAL_ERROR
}
