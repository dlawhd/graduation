package shop.esjh.memoryjar.entity.support;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.AccessLevel;
import shop.esjh.memoryjar.entity.ai.JarAiGeneration;
import shop.esjh.memoryjar.enums.support.SupportInquiryStatus;
import java.time.LocalDateTime;

/** 실패 기록을 서버에서 복사하고, 명시적으로 공유한 원본과 문의/답변을 기간별로 보관한다. */
@Entity
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@Table(name = "support_inquiries")
public class SupportInquiry {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long inquiryId;
    @Column(nullable = false) private Long ownerId;
    @Column(nullable = false, unique = true) private Long generationId;
    @Column(nullable = false) private Long draftId;
    @Column(nullable = false, length = 30) private String style;
    @Column(nullable = false, length = 50) private String errorCode;
    @Column(nullable = false, length = 150) private String model;
    @Column(nullable = false, length = 100) private String promptVersion;
    @Column(nullable = false) private LocalDateTime failedAt;
    @Column(nullable = false, length = 1000) private String description;
    @Column(length = 3000) private String reply;
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 20)
    private SupportInquiryStatus status;
    @Column(name = "source_s3_key", length = 512) private String sourceS3Key;
    @Column(name = "image_s3_key", nullable = false, length = 512) private String imageS3Key;
    private LocalDateTime imageDeletedAt;
    @Column(nullable = false) private LocalDateTime imageExpiresAt;
    @Column(nullable = false) private LocalDateTime contentExpiresAt;
    private LocalDateTime contentDeletedAt;
    @Column(nullable = false) private LocalDateTime sharingAgreedAt;
    private LocalDateTime repliedAt;
    @Column(nullable = false) private LocalDateTime createdAt;
    @Column(nullable = false) private LocalDateTime updatedAt;

    public static SupportInquiry reserve(Long userId, JarAiGeneration generation, String description,
                                         String imageKey, LocalDateTime now) {
        SupportInquiry ticket = new SupportInquiry();
        ticket.ownerId = userId;
        ticket.generationId = generation.getGenerationId();
        ticket.draftId = generation.getDraft().getDraftId();
        ticket.style = generation.getAiStyle().name();
        ticket.errorCode = generation.getErrorCode().name();
        ticket.model = generation.getAiModel();
        ticket.promptVersion = generation.getPromptVersion();
        ticket.failedAt = generation.getCompletedAt();
        ticket.createdAt = now;
        ticket.restartCopy(description, generation.getDraft().getOriginalS3Key(), imageKey, now);
        return ticket;
    }

    /** 이전 실패 파일의 삭제가 끝난 뒤에만 새 UUID 키로 재시도한다. 키를 재사용하지 않는다. */
    public void restartCopy(String description, String sourceKey, String imageKey, LocalDateTime now) {
        this.description = description;
        sourceS3Key = sourceKey;
        imageS3Key = imageKey;
        imageDeletedAt = null;
        imageExpiresAt = now.plusDays(30);
        contentExpiresAt = now.plusDays(90);
        contentDeletedAt = null;
        sharingAgreedAt = now;
        status = SupportInquiryStatus.COPYING;
        updatedAt = now;
    }

    public boolean isSubmitted() {
        return status == SupportInquiryStatus.OPEN || status == SupportInquiryStatus.IN_PROGRESS
                || status == SupportInquiryStatus.ANSWERED;
    }

    public void finishCopy(LocalDateTime now) {
        status = SupportInquiryStatus.OPEN;
        sourceS3Key = null;
        updatedAt = now;
    }

    public void failCopy(LocalDateTime now) {
        status = SupportInquiryStatus.COPY_FAILED;
        sourceS3Key = null;
        updatedAt = now;
    }

    public void startReview(LocalDateTime now) {
        status = SupportInquiryStatus.IN_PROGRESS;
        updatedAt = now;
    }

    public void answer(String text, LocalDateTime now) {
        reply = text;
        repliedAt = now;
        status = SupportInquiryStatus.ANSWERED;
        updatedAt = now;
    }

    public void markImageDeleted(LocalDateTime now) { imageDeletedAt = now; }

    /** 상세 내용만 지워도 접수 번호는 남겨 동일 후보의 재접수를 막는다. */
    public void redactContent(LocalDateTime now) {
        description = "";
        reply = null;
        sourceS3Key = null;
        contentDeletedAt = now;
    }
}
