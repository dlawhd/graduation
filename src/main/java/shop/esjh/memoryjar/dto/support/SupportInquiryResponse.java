package shop.esjh.memoryjar.dto.support;

import shop.esjh.memoryjar.entity.support.SupportInquiry;
import shop.esjh.memoryjar.enums.support.SupportInquiryStatus;
import shop.esjh.memoryjar.enums.support.SupportCategory;
import java.time.LocalDateTime;
import java.util.List;

/** 목록/상세 응답에는 S3 키와 URL을 넣지 않는다. 운영 진단 버전은 운영자 상세에만 포함한다. */
public record SupportInquiryResponse(Long inquiryId, Long generationId, Long draftId, String style,
        String errorCode, LocalDateTime failedAt, String description, String reply, SupportInquiryStatus status,
        LocalDateTime createdAt, LocalDateTime repliedAt, LocalDateTime imageExpiresAt,
        LocalDateTime contentExpiresAt, boolean imageAvailable, boolean contentExpired,
        String model, String promptVersion, SupportCategory category, String title, Long contextJarId,
        String contextPath, String clientErrorCode, java.time.OffsetDateTime occurredAt, LocalDateTime resolvedAt, boolean guest) {
    /** 기존 응답 생성 호출과 테스트를 유지한다. 새 필드는 기존 AI 실패 문의의 기본값으로 채운다. */
    public SupportInquiryResponse(Long inquiryId, Long generationId, Long draftId, String style, String errorCode,
            LocalDateTime failedAt, String description, String reply, SupportInquiryStatus status,
            LocalDateTime createdAt, LocalDateTime repliedAt, LocalDateTime imageExpiresAt, LocalDateTime contentExpiresAt,
            boolean imageAvailable, boolean contentExpired, String model, String promptVersion) {
        this(inquiryId,generationId,draftId,style,errorCode,failedAt,description,reply,status,createdAt,repliedAt,
                imageExpiresAt,contentExpiresAt,imageAvailable,contentExpired,model,promptVersion,
                SupportCategory.AI_GENERATION,null,null,null,null,null,null,false);
    }
    public static SupportInquiryResponse from(SupportInquiry i, boolean operator, LocalDateTime now) {
        boolean expired = i.getContentDeletedAt() != null || !i.getContentExpiresAt().isAfter(now);
        return new SupportInquiryResponse(i.getInquiryId(), i.getGenerationId(), i.getDraftId(), i.getStyle(),
                i.getErrorCode(), i.getFailedAt(), expired ? "" : i.getDescription(), expired ? null : i.getReply(),
                i.getStatus(), i.getCreatedAt(), i.getRepliedAt(), i.getImageExpiresAt(), i.getContentExpiresAt(),
                i.isSubmitted() && i.getImageS3Key() != null && i.getImageDeletedAt() == null
                        && i.getImageExpiresAt() != null && i.getImageExpiresAt().isAfter(now), expired,
                operator ? i.getModel() : null, operator ? i.getPromptVersion() : null,
                i.getCategory(), expired ? null : i.getTitle(), expired ? null : i.getContextJarId(),
                expired ? null : i.getContextPath(), expired ? null : i.getClientErrorCode(),
                expired || i.getOccurredAt()==null ? null : i.getOccurredAt().atOffset(java.time.ZoneOffset.ofHours(9)), i.getResolvedAt(), i.getGuestSessionId() != null);
    }

    /** 마지막 ID를 커서로 사용해 전체 목록을 한 번에 내려받지 않는다. */
    public record InquiryPage(List<SupportInquiryResponse> items, Long nextBefore) { }
}
