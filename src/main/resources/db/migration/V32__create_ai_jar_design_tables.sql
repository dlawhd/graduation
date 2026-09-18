-- AI 커스텀 디자인은 Jar 생성 전에 Draft에서 관리한다.
-- 기존 jars 테이블은 변경하지 않으며, 기본 Jar 생성 흐름도 그대로 유지한다.

CREATE TABLE jar_design_drafts (
    draft_id BIGINT NOT NULL AUTO_INCREMENT,
    owner_id BIGINT NOT NULL,
    original_s3_key VARCHAR(512) NOT NULL,
    selected_design_type VARCHAR(20) NULL,
    selected_generation_id BIGINT NULL,
    slot_center_x DECIMAL(6,5) NULL,
    slot_center_y DECIMAL(6,5) NULL,
    slot_size_ratio DECIMAL(6,5) NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    finalized_jar_id BIGINT NULL,
    expires_at DATETIME(6) NOT NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
        ON UPDATE CURRENT_TIMESTAMP(6),

    PRIMARY KEY (draft_id),

    CONSTRAINT uk_jar_design_drafts_finalized_jar
        UNIQUE (finalized_jar_id),

    CONSTRAINT fk_jar_design_drafts_owner
        FOREIGN KEY (owner_id) REFERENCES users(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_jar_design_drafts_finalized_jar
        FOREIGN KEY (finalized_jar_id) REFERENCES jars(jar_id)
        ON DELETE RESTRICT,

    CONSTRAINT chk_jar_design_drafts_original_s3_key
        CHECK (CHAR_LENGTH(TRIM(original_s3_key)) > 0),

    -- AI 선택일 때만 후보 ID를 저장한다.
    CONSTRAINT chk_jar_design_drafts_design_selection
        CHECK (
            (
                selected_design_type = 'AI'
                AND selected_generation_id IS NOT NULL
            )
            OR
            (
                (
                    selected_design_type IS NULL
                    OR selected_design_type IN ('ORIGINAL', 'DEFAULT')
                )
                AND selected_generation_id IS NULL
            )
        ),

    -- Slot 값은 세 개 모두 없거나, 모두 유효한 범위의 값이어야 한다.
    CONSTRAINT chk_jar_design_drafts_slot_values
        CHECK (
            (
                slot_center_x IS NULL
                AND slot_center_y IS NULL
                AND slot_size_ratio IS NULL
            )
            OR
            (
                slot_center_x IS NOT NULL
                AND slot_center_y IS NOT NULL
                AND slot_size_ratio IS NOT NULL
                AND slot_center_x >= 0 AND slot_center_x <= 1
                AND slot_center_y >= 0 AND slot_center_y <= 1
                AND slot_size_ratio >= 0 AND slot_size_ratio <= 1
            )
        ),

    -- 미선택 또는 DEFAULT 디자인에는 커스텀 Slot을 남기지 않는다.
    CONSTRAINT chk_jar_design_drafts_slot_for_design
        CHECK (
            (
                (
                    selected_design_type IS NULL
                    OR selected_design_type = 'DEFAULT'
                )
                AND slot_center_x IS NULL
                AND slot_center_y IS NULL
                AND slot_size_ratio IS NULL
            )
            OR selected_design_type IN ('ORIGINAL', 'AI')
        ),

    CONSTRAINT chk_jar_design_drafts_status
        CHECK (status IN ('ACTIVE', 'FINALIZED', 'ABANDONED', 'EXPIRED')),

    -- FINALIZED Draft만 Jar를 연결하며, 최종 선택도 반드시 있어야 한다.
    CONSTRAINT chk_jar_design_drafts_finalized_state
        CHECK (
            (
                status = 'FINALIZED'
                AND finalized_jar_id IS NOT NULL
                AND selected_design_type IS NOT NULL
            )
            OR
            (
                status IN ('ACTIVE', 'ABANDONED', 'EXPIRED')
                AND finalized_jar_id IS NULL
            )
        ),

    -- ORIGINAL/AI 최종화에는 Slot이 필요하고 DEFAULT 최종화에는 Slot이 없다.
    CONSTRAINT chk_jar_design_drafts_finalized_slot
        CHECK (
            status <> 'FINALIZED'
            OR
            (
                selected_design_type = 'DEFAULT'
                AND slot_center_x IS NULL
                AND slot_center_y IS NULL
                AND slot_size_ratio IS NULL
            )
            OR
            (
                selected_design_type IN ('ORIGINAL', 'AI')
                AND slot_center_x IS NOT NULL
                AND slot_center_y IS NOT NULL
                AND slot_size_ratio IS NOT NULL
            )
        ),

    CONSTRAINT chk_jar_design_drafts_expires_at
        CHECK (expires_at >= created_at)
);

CREATE INDEX idx_jar_design_drafts_owner_status
    ON jar_design_drafts (owner_id, status);

CREATE INDEX idx_jar_design_drafts_status_expires
    ON jar_design_drafts (status, expires_at);


CREATE TABLE jar_ai_generations (
    generation_id BIGINT NOT NULL AUTO_INCREMENT,
    draft_id BIGINT NOT NULL,
    ai_style VARCHAR(30) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PROCESSING',
    ai_provider VARCHAR(40) NOT NULL,
    ai_model VARCHAR(150) NOT NULL,
    prompt_version VARCHAR(100) NOT NULL,
    seed BIGINT NULL,
    reference_image_version VARCHAR(50) NULL,
    postprocess_version VARCHAR(50) NULL,
    generated_s3_key VARCHAR(512) NULL,
    s3_deleted_at DATETIME(6) NULL,
    error_code VARCHAR(50) NULL,
    error_message VARCHAR(1000) NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    completed_at DATETIME(6) NULL,
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
        ON UPDATE CURRENT_TIMESTAMP(6),

    PRIMARY KEY (generation_id),

    -- Draft의 선택 후보 복합 FK가 같은 Draft 소속을 보장할 수 있게 한다.
    CONSTRAINT uk_jar_ai_generations_id_draft
        UNIQUE (generation_id, draft_id),

    CONSTRAINT fk_jar_ai_generations_draft
        FOREIGN KEY (draft_id) REFERENCES jar_design_drafts(draft_id)
        ON DELETE CASCADE,

    CONSTRAINT chk_jar_ai_generations_ai_style
        CHECK (
            ai_style IN (
                'CUTE_2D',
                'SOFT_25D',
                'WATERCOLOR',
                'HAND_DRAWN',
                'WEIRDO',
                'PIXEL'
            )
        ),

    CONSTRAINT chk_jar_ai_generations_required_text
        CHECK (
            CHAR_LENGTH(TRIM(ai_provider)) > 0
            AND CHAR_LENGTH(TRIM(ai_model)) > 0
            AND CHAR_LENGTH(TRIM(prompt_version)) > 0
        ),

    -- PIXEL만 Reference와 후처리 버전을 기록한다.
    CONSTRAINT chk_jar_ai_generations_pixel_versions
        CHECK (
            (
                ai_style = 'PIXEL'
                AND reference_image_version IS NOT NULL
                AND CHAR_LENGTH(TRIM(reference_image_version)) > 0
                AND postprocess_version IS NOT NULL
                AND CHAR_LENGTH(TRIM(postprocess_version)) > 0
            )
            OR
            (
                ai_style IN (
                    'CUTE_2D',
                    'SOFT_25D',
                    'WATERCOLOR',
                    'HAND_DRAWN',
                    'WEIRDO'
                )
                AND reference_image_version IS NULL
                AND postprocess_version IS NULL
            )
        ),

    -- 상태별 성공 결과 또는 실패 정보를 모순 없이 저장한다.
    CONSTRAINT chk_jar_ai_generations_state
        CHECK (
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
                    'SOURCE_IMAGE_LOAD_FAILED',
                    'PROVIDER_REQUEST_FAILED',
                    'PROVIDER_TIMEOUT',
                    'PROVIDER_RATE_LIMITED',
                    'PROVIDER_INVALID_RESPONSE',
                    'PIXEL_POSTPROCESS_FAILED',
                    'S3_UPLOAD_FAILED',
                    'GENERATION_TIMEOUT',
                    'INTERNAL_ERROR'
                )
                AND (
                    error_message IS NULL
                    OR CHAR_LENGTH(TRIM(error_message)) > 0
                )
                AND completed_at IS NOT NULL
            )
        ),

    CONSTRAINT chk_jar_ai_generations_completed_at
        CHECK (
            completed_at IS NULL
            OR completed_at >= created_at
        ),

    CONSTRAINT chk_jar_ai_generations_s3_deleted_at
        CHECK (
            s3_deleted_at IS NULL
            OR (
                completed_at IS NOT NULL
                AND s3_deleted_at >= completed_at
            )
        )
);

CREATE INDEX idx_jar_ai_generations_draft_status_created
    ON jar_ai_generations (draft_id, status, created_at);

CREATE INDEX idx_jar_ai_generations_status_created
    ON jar_ai_generations (status, created_at);


-- Draft와 Generation의 순환 참조는 두 테이블 생성 뒤에 추가한다.
CREATE INDEX idx_jar_design_drafts_selected_generation_draft
    ON jar_design_drafts (selected_generation_id, draft_id);

ALTER TABLE jar_design_drafts
    ADD CONSTRAINT fk_jar_design_drafts_selected_generation
        FOREIGN KEY (selected_generation_id, draft_id)
        REFERENCES jar_ai_generations (generation_id, draft_id)
        ON DELETE RESTRICT;


CREATE TABLE jar_designs (
    jar_design_id BIGINT NOT NULL AUTO_INCREMENT,
    jar_id BIGINT NOT NULL,
    design_type VARCHAR(20) NOT NULL,
    final_s3_key VARCHAR(512) NOT NULL,
    selected_generation_id BIGINT NULL,
    slot_center_x DECIMAL(6,5) NOT NULL,
    slot_center_y DECIMAL(6,5) NOT NULL,
    slot_size_ratio DECIMAL(6,5) NOT NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    PRIMARY KEY (jar_design_id),

    CONSTRAINT uk_jar_designs_jar
        UNIQUE (jar_id),

    CONSTRAINT uk_jar_designs_selected_generation
        UNIQUE (selected_generation_id),

    CONSTRAINT fk_jar_designs_jar
        FOREIGN KEY (jar_id) REFERENCES jars(jar_id)
        ON DELETE CASCADE,

    CONSTRAINT fk_jar_designs_selected_generation
        FOREIGN KEY (selected_generation_id)
        REFERENCES jar_ai_generations(generation_id)
        ON DELETE RESTRICT,

    CONSTRAINT chk_jar_designs_type_selection
        CHECK (
            (
                design_type = 'ORIGINAL'
                AND selected_generation_id IS NULL
            )
            OR
            (
                design_type = 'AI'
                AND selected_generation_id IS NOT NULL
            )
        ),

    CONSTRAINT chk_jar_designs_final_s3_key
        CHECK (CHAR_LENGTH(TRIM(final_s3_key)) > 0),

    CONSTRAINT chk_jar_designs_slot_values
        CHECK (
            slot_center_x >= 0 AND slot_center_x <= 1
            AND slot_center_y >= 0 AND slot_center_y <= 1
            AND slot_size_ratio >= 0 AND slot_size_ratio <= 1
        )
);
