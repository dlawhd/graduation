-- 기존 생성 이력과 상태 규칙은 유지하고 안전하게 분류한 새 실패 코드만 허용한다.
-- Java에 이미 있던 GENERATION_QUEUE_FULL도 허용해 대기열 거절 시 실패 상태를 저장할 수 있게 한다.
ALTER TABLE jar_ai_generations
    DROP CONSTRAINT chk_jar_ai_generations_state,
    ADD CONSTRAINT chk_jar_ai_generations_state CHECK (
        (
            status = 'PROCESSING'
            AND generated_s3_key IS NULL
            AND s3_deleted_at IS NULL
            AND error_code IS NULL
            AND error_message IS NULL
            AND completed_at IS NULL
        )
        OR
        (
            status = 'SUCCEEDED'
            AND generated_s3_key IS NOT NULL
            AND CHAR_LENGTH(TRIM(generated_s3_key)) > 0
            AND error_code IS NULL
            AND error_message IS NULL
            AND completed_at IS NOT NULL
        )
        OR
        (
            status = 'FAILED'
            AND generated_s3_key IS NULL
            AND s3_deleted_at IS NULL
            AND error_code IN (
                'SOURCE_IMAGE_LOAD_FAILED', 'PROVIDER_REQUEST_FAILED',
                'PROVIDER_CONTENT_POLICY_REJECTED', 'PROVIDER_INPUT_INVALID',
                'PROVIDER_QUOTA_EXCEEDED', 'PROVIDER_CAPACITY_EXCEEDED',
                'PROVIDER_CONFIGURATION_UNAVAILABLE', 'PROVIDER_TIMEOUT',
                'PROVIDER_RATE_LIMITED', 'PROVIDER_INVALID_RESPONSE',
                'PIXEL_POSTPROCESS_FAILED', 'S3_UPLOAD_FAILED',
                'CANDIDATE_CONTENT_POLICY_REJECTED', 'CANDIDATE_MODERATION_UNAVAILABLE',
                'GENERATION_QUEUE_FULL', 'GENERATION_TIMEOUT', 'INTERNAL_ERROR'
            )
            AND (error_message IS NULL OR CHAR_LENGTH(TRIM(error_message)) > 0)
            AND completed_at IS NOT NULL
        )
    );
