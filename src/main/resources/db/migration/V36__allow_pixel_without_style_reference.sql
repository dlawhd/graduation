-- 신규 PIXEL_V6는 사용자 원본만 입력한다. 과거 Reference 버전과 저장 이미지는 변경하지 않는다.
-- 참조는 선택 사항으로 완화하지만, 사용한 참조의 빈 문자열과 후처리 버전 누락은 계속 거절한다.
ALTER TABLE jar_ai_generations
    DROP CONSTRAINT chk_jar_ai_generations_pixel_versions,
    ADD CONSTRAINT chk_jar_ai_generations_pixel_versions CHECK (
        (
            ai_style = 'PIXEL'
            AND (reference_image_version IS NULL OR CHAR_LENGTH(TRIM(reference_image_version)) > 0)
            AND postprocess_version IS NOT NULL
            AND CHAR_LENGTH(TRIM(postprocess_version)) > 0
        )
        OR
        (
            ai_style IN ('CUTE_2D', 'SOFT_25D', 'WATERCOLOR', 'HAND_DRAWN', 'WEIRDO')
            AND reference_image_version IS NULL
            AND postprocess_version IS NULL
        )
    );
