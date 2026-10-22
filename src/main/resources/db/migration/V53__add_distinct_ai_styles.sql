-- 기존 후보와 PIXEL 버전 계약은 보존하고 신규 세 스타일의 저장만 허용한다.
ALTER TABLE jar_ai_generations
    DROP CONSTRAINT chk_jar_ai_generations_ai_style,
    DROP CONSTRAINT chk_jar_ai_generations_pixel_versions,
    ADD CONSTRAINT chk_jar_ai_generations_ai_style CHECK (
        ai_style IN ('CUTE_2D', 'SOFT_25D', 'WATERCOLOR', 'HAND_DRAWN', 'WEIRDO', 'PIXEL',
                     'NEON_DRAWING', 'CHROME_MIRROR', 'RISO_PRINT')
    ),
    ADD CONSTRAINT chk_jar_ai_generations_pixel_versions CHECK (
        (ai_style = 'PIXEL'
            AND (reference_image_version IS NULL OR CHAR_LENGTH(TRIM(reference_image_version)) > 0)
            AND postprocess_version IS NOT NULL AND CHAR_LENGTH(TRIM(postprocess_version)) > 0)
        OR
        (ai_style IN ('CUTE_2D', 'SOFT_25D', 'WATERCOLOR', 'HAND_DRAWN', 'WEIRDO',
                      'NEON_DRAWING', 'CHROME_MIRROR', 'RISO_PRINT')
            AND reference_image_version IS NULL AND postprocess_version IS NULL)
    );
