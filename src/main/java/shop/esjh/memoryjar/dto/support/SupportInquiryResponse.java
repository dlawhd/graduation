package shop.esjh.memoryjar.dto.support;

import shop.esjh.memoryjar.entity.support.SupportInquiry;
import shop.esjh.memoryjar.enums.support.SupportInquiryStatus;
import java.time.LocalDateTime;
import java.util.List;

/** 목록/상세 응답에는 S3 키와 URL을 넣지 않는다. 운영 진단 버전은 운영자 상세에만 포함한다. */
public record SupportInquiryResponse(Long inquiryId, Long generationId, Long draftId, String style,
        String errorCode, LocalDateTime failedAt, String description, String reply, SupportInquiryStatus status,
        LocalDateTime createdAt, LocalDateTime repliedAt, LocalDateTime imageExpiresAt,
        LocalDateTime contentExpiresAt, boolean imageAvailable, boolean contentExpired,
        String model, String promptVersion) {
    public static SupportInquiryResponse from(SupportInquiry i, boolean operator, LocalDateTime now) {
        boolean expired = i.getContentDeletedAt() != null || !i.getContentExpiresAt().isAfter(now);
        return new SupportInquiryResponse(i.getInquiryId(), i.getGenerationId(), i.getDraftId(), i.getStyle(),
                i.getErrorCode(), i.getFailedAt(), expired ? "" : i.getDescription(), expired ? null : i.getReply(),
                i.getStatus(), i.getCreatedAt(), i.getRepliedAt(), i.getImageExpiresAt(), i.getContentExpiresAt(),
                i.isSubmitted() && i.getImageDeletedAt() == null && i.getImageExpiresAt().isAfter(now), expired,
                operator ? i.getModel() : null, operator ? i.getPromptVersion() : null);
    }

    /** 마지막 ID를 커서로 사용해 전체 목록을 한 번에 내려받지 않는다. */
    public record InquiryPage(List<SupportInquiryResponse> items, Long nextBefore) { }
}
