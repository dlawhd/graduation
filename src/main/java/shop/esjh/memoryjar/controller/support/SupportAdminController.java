package shop.esjh.memoryjar.controller.support;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;
import org.springframework.security.core.Authentication;
import shop.esjh.memoryjar.dto.response.ApiResponse;
import shop.esjh.memoryjar.dto.support.*;
import shop.esjh.memoryjar.dto.ai.response.JarAiGenerationPreviewResponse;
import shop.esjh.memoryjar.enums.support.SupportInquiryStatus;
import shop.esjh.memoryjar.service.support.*;
import static shop.esjh.memoryjar.service.support.SupportAuthorization.currentUserId;

/** 문의 전용 운영 API다. 서비스 계층이 모든 요청에서 운영자 설정을 다시 검사한다. */
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/admin/support/inquiries")
public class SupportAdminController {
    private final SupportInquiryService service;
    private final SupportInquiryPersistenceService persistence;
    private final SupportConversationService conversations;
    private final SupportAttachmentService attachments;
    private final SupportAttachmentPersistenceService attachmentPersistence;
    private final OperatorMfaService mfa;

    /** 이 컨트롤러의 모든 읽기·변경·사진 요청은 본문 처리 전에 추가 인증부터 확인한다. */
    @ModelAttribute
    void requireAdditionalAuthentication(Authentication auth, jakarta.servlet.http.HttpServletResponse response) {
        response.setHeader("Cache-Control", "no-store");
        mfa.requireVerified(auth);
    }
    @GetMapping("/{id}/view")
    public ApiResponse<SupportDetailResponse> view(Authentication auth,@PathVariable Long id) {
        return ApiResponse.of(conversations.view(SupportActor.operator(currentUserId(auth)),id));
    }

    @GetMapping
    public ApiResponse<SupportInquiryResponse.InquiryPage> list(Authentication auth,
            @RequestParam(required = false) Long before, @RequestParam(required = false) SupportInquiryStatus status) {
        return ApiResponse.of(persistence.list(currentUserId(auth), before, status, true));
    }
    @GetMapping("/{id}")
    public ApiResponse<SupportInquiryResponse> detail(Authentication auth, @PathVariable Long id) {
        return ApiResponse.of(persistence.detail(currentUserId(auth), id, true));
    }
    @GetMapping("/{id}/image")
    public ApiResponse<JarAiGenerationPreviewResponse> image(Authentication auth, @PathVariable Long id) {
        return ApiResponse.of(service.preview(currentUserId(auth), id, true));
    }
    @PostMapping("/{id}/review")
    public ApiResponse<SupportInquiryResponse> review(Authentication auth, @PathVariable Long id) {
        return ApiResponse.of(persistence.review(currentUserId(auth), id));
    }
    @PostMapping("/{id}/reply")
    public ApiResponse<SupportInquiryResponse> reply(Authentication auth, @PathVariable Long id,
            @Valid @RequestBody SupportReplyRequest request) {
        return ApiResponse.of(persistence.reply(currentUserId(auth), id, request.reply()));
    }
@GetMapping("/{id}/messages")
    public ApiResponse<SupportMessageResponse.MessagePage> messages(Authentication auth,@PathVariable Long id,
            @RequestParam(required=false) Long before) {
        return ApiResponse.of(conversations.messages(SupportActor.operator(currentUserId(auth)),id,before));
    }
    @PostMapping("/{id}/messages")
    public ApiResponse<SupportMessageResponse> message(Authentication auth,@PathVariable Long id,
            @Valid @RequestBody SupportMessageRequest request) {
        return ApiResponse.of(conversations.append(SupportActor.operator(currentUserId(auth)),id,request));
    }
    @PostMapping("/{id}/resolve")
    public ApiResponse<SupportInquiryResponse> resolve(Authentication auth,@PathVariable Long id) {
        return ApiResponse.of(conversations.resolve(SupportActor.operator(currentUserId(auth)),id,true));
    }
    @PostMapping("/{id}/reopen")
    public ApiResponse<SupportInquiryResponse> reopen(Authentication auth,@PathVariable Long id) {
        return ApiResponse.of(conversations.resolve(SupportActor.operator(currentUserId(auth)),id,false));
    }
    @GetMapping("/{id}/attachments")
    public ApiResponse<java.util.List<SupportAttachmentResponse>> attachments(Authentication auth,@PathVariable Long id) {
        return ApiResponse.of(attachmentPersistence.list(SupportActor.operator(currentUserId(auth)),id));
    }
    @PostMapping(value="/{id}/attachments",consumes="multipart/form-data")
    public ApiResponse<SupportAttachmentResponse> upload(Authentication auth,@PathVariable Long id,
            @RequestParam java.util.UUID requestId,@RequestParam boolean shareScreenshot,
            @RequestPart("image") org.springframework.web.multipart.MultipartFile image) {
        return ApiResponse.of(attachments.upload(SupportActor.operator(currentUserId(auth)),id,requestId.toString(),image,shareScreenshot));
    }
    @GetMapping("/{id}/attachments/{attachmentId}/image")
    public ApiResponse<JarAiGenerationPreviewResponse> attachmentImage(Authentication auth,@PathVariable Long id,@PathVariable Long attachmentId) {
        return ApiResponse.of(attachments.preview(SupportActor.operator(currentUserId(auth)),id,attachmentId));
    }
}
