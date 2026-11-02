package shop.esjh.memoryjar.entity.support;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.AccessLevel;
import shop.esjh.memoryjar.entity.ai.JarAiGeneration;
import shop.esjh.memoryjar.enums.support.SupportInquiryStatus;
import shop.esjh.memoryjar.enums.support.SupportCategory;
import java.time.LocalDateTime;

/** 실패 기록을 서버에서 복사하고, 명시적으로 공유한 원본과 문의/답변을 기간별로 보관한다. */
@Entity
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@Table(name = "support_inquiries")
public class SupportInquiry {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long inquiryId;
    private Long ownerId;
    @Column(unique = true) private Long generationId;
    private Long draftId;
    @Column(length = 30) private String style;
    @Column(length = 50) private String errorCode;
    @Column(length = 150) private String model;
    @Column(length = 100) private String promptVersion;
    private LocalDateTime failedAt;
    @Column(nullable = false, length = 1000) private String description;
    @Column(length = 3000) private String reply;
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 20)
    private SupportInquiryStatus status;
    @Column(name = "source_s3_key", length = 512) private String sourceS3Key;
    @Column(name = "image_s3_key", length = 512) private String imageS3Key;
    private LocalDateTime imageDeletedAt;
    private LocalDateTime imageExpiresAt;
    @Column(nullable = false) private LocalDateTime contentExpiresAt;
    private LocalDateTime contentDeletedAt;
    private LocalDateTime sharingAgreedAt;
    private LocalDateTime repliedAt;
    @Column(nullable = false) private LocalDateTime createdAt;
    @Column(nullable = false) private LocalDateTime updatedAt;
    private Long guestSessionId;
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 30)
    private SupportCategory category = SupportCategory.AI_GENERATION;
    @Column(length = 100) private String title;
    @Column(length = 36, columnDefinition = "CHAR(36)") private String clientRequestId;
    @Column(length = 64, columnDefinition = "CHAR(64)") private String requestFingerprint;
    private Long contextJarId;
    @Column(length = 120) private String contextPath;
    @Column(length = 80) private String clientErrorCode;
    private LocalDateTime occurredAt;
    private LocalDateTime resolvedAt;
    @Column(nullable=false) private LocalDateTime lastSubmittedAt;

    /** 일반 문의는 원본 공유나 AI 후보를 요구하지 않는다. 로그인 도움은 별도 게스트 세션에만 귀속된다. */
    public static SupportInquiry openGeneral(Long ownerId, Long guestId, SupportCategory category, String title,
            String content, String requestId, String fingerprint, Long jarId, Long draftId, String path, String clientCode,
            LocalDateTime occurredAt, LocalDateTime now) {
        SupportInquiry i = new SupportInquiry();
        i.ownerId = ownerId; i.guestSessionId = guestId; i.category = category; i.title = title;
        i.description = content; i.clientRequestId = requestId; i.contextJarId = jarId; i.draftId = draftId;
        i.requestFingerprint = fingerprint;
        i.contextPath = path; i.clientErrorCode = clientCode; i.occurredAt = occurredAt;
        i.status = SupportInquiryStatus.OPEN; i.createdAt = now; i.updatedAt = now;
        i.contentExpiresAt = now.plusDays(90);
        i.lastSubmittedAt = now;
        return i;
    }

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
        lastSubmittedAt = now;
        status = SupportInquiryStatus.COPYING;
        updatedAt = now;
    }

    public boolean isSubmitted() {
        return status == SupportInquiryStatus.OPEN || status == SupportInquiryStatus.IN_PROGRESS
                || status == SupportInquiryStatus.ANSWERED || status == SupportInquiryStatus.WAITING_USER
                || status == SupportInquiryStatus.RESOLVED;
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

    /** 추가 대화는 최초 답변의 호환 필드를 보존하고 처리 상태만 최신으로 바꾼다. */
    public void messageAdded(boolean operator, boolean waitingForUser, String text, LocalDateTime now) {
        if (operator && reply == null) { reply = text; repliedAt = now; }
        status = operator ? (waitingForUser ? SupportInquiryStatus.WAITING_USER : SupportInquiryStatus.ANSWERED)
                : SupportInquiryStatus.IN_PROGRESS;
        resolvedAt = null; updatedAt = now;
    }

    /** 해결은 답변 등록과 별도 상태이며, 재개 시 대화 기록은 그대로 유지한다. */
    public void resolve(boolean resolved, LocalDateTime now) {
        status = resolved ? SupportInquiryStatus.RESOLVED : SupportInquiryStatus.IN_PROGRESS;
        resolvedAt = resolved ? now : null; updatedAt = now;
    }

    public void markImageDeleted(LocalDateTime now) { imageDeletedAt = now; }

    /** 상세 내용만 지워도 접수 번호는 남겨 동일 후보의 재접수를 막는다. */
    public void redactContent(LocalDateTime now) {
        description = "";
        reply = null;
        sourceS3Key = null;
        title = null; contextPath = null; clientErrorCode = null; contextJarId = null; occurredAt = null;
        contentDeletedAt = now;
    }
}
