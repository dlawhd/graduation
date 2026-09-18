package shop.esjh.memoryjar.entity.ai;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EntityListeners;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;
import shop.esjh.memoryjar.enums.ai.JarAiGenerationErrorCode;
import shop.esjh.memoryjar.enums.ai.JarAiGenerationStatus;
import shop.esjh.memoryjar.enums.ai.JarAiProvider;
import shop.esjh.memoryjar.enums.ai.JarAiStyle;

import java.time.LocalDateTime;

/**
 * 하나의 Draft에서 AI에게 요청한 후보 이미지 생성 기록이다.
 * 외부 AI 호출 자체는 트랜잭션 밖에서 수행하고, 이 Entity에는 요청의 재현 정보와 결과만 저장한다.
 */
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@Entity
@EntityListeners(AuditingEntityListener.class)
@Table(name = "jar_ai_generations")
public class JarAiGeneration {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "generation_id")
    private Long generationId;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "draft_id", nullable = false)
    private JarDesignDraft draft;

    @Enumerated(EnumType.STRING)
    @Column(name = "ai_style", nullable = false, length = 30)
    private JarAiStyle aiStyle;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private JarAiGenerationStatus status;

    @Enumerated(EnumType.STRING)
    @Column(name = "ai_provider", nullable = false, length = 40)
    private JarAiProvider aiProvider;

    @Column(name = "ai_model", nullable = false, length = 150)
    private String aiModel;

    @Column(name = "prompt_version", nullable = false, length = 100)
    private String promptVersion;

    @Column(name = "seed")
    private Long seed;

    @Column(name = "reference_image_version", length = 50)
    private String referenceImageVersion;

    @Column(name = "postprocess_version", length = 50)
    private String postprocessVersion;

    @Column(name = "generated_s3_key", length = 512)
    private String generatedS3Key;

    @Column(name = "s3_deleted_at")
    private LocalDateTime s3DeletedAt;

    @Enumerated(EnumType.STRING)
    @Column(name = "error_code", length = 50)
    private JarAiGenerationErrorCode errorCode;

    @Column(name = "error_message", length = 1000)
    private String errorMessage;

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "completed_at")
    private LocalDateTime completedAt;

    @LastModifiedDate
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @Builder
    private JarAiGeneration(JarDesignDraft draft, JarAiStyle aiStyle, JarAiProvider aiProvider,
                            String aiModel, String promptVersion, Long seed,
                            String referenceImageVersion, String postprocessVersion) {
        this.draft = draft;
        this.aiStyle = aiStyle;
        this.status = JarAiGenerationStatus.PROCESSING;
        this.aiProvider = aiProvider;
        this.aiModel = aiModel;
        this.promptVersion = promptVersion;
        this.seed = seed;
        this.referenceImageVersion = referenceImageVersion;
        this.postprocessVersion = postprocessVersion;
    }

    public boolean isSelectableSucceededCandidate() {
        return status == JarAiGenerationStatus.SUCCEEDED
                && generatedS3Key != null && !generatedS3Key.isBlank()
                && s3DeletedAt == null;
    }
}
