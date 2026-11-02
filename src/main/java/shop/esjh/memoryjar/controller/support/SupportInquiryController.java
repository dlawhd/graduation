package shop.esjh.memoryjar.controller.support;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;
import org.springframework.security.core.Authentication;
import shop.esjh.memoryjar.dto.response.ApiResponse;
import shop.esjh.memoryjar.dto.support.*;
import shop.esjh.memoryjar.dto.ai.response.JarAiGenerationPreviewResponse;
import shop.esjh.memoryjar.service.support.*;
import java.util.List;
import java.util.Map;
import static shop.esjh.memoryjar.service.support.SupportAuthorization.currentUserId;

/** 로그인한 사용자의 일반/AI 문의, 추가 대화와 첨부 요청을 서비스에 전달한다. */
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/support")
public class SupportInquiryController {
    private final SupportInquiryService service;
    private final SupportInquiryPersistenceService persistence;
    private final SupportConversationService conversations;
    private final SupportAttachmentService attachments;
    private final SupportAttachmentPersistenceService attachmentPersistence;
    private final SupportAuthorization authorization;

    @GetMapping("/permissions")
    public ApiResponse<Map<String, Boolean>> permissions(Authentication auth) {
        return ApiResponse.of(Map.of("operator", authorization.isOperator(currentUserId(auth))));
    }
    @PostMapping("/inquiries")
    public ApiResponse<SupportInquiryResponse> create(Authentication auth, @Valid @RequestBody SupportCreateRequest request) {
        return ApiResponse.of(service.create(currentUserId(auth), request));
    }
    @GetMapping("/inquiries")
    public ApiResponse<SupportInquiryResponse.InquiryPage> list(Authentication auth, @RequestParam(required = false) Long before) {
        return ApiResponse.of(persistence.list(currentUserId(auth), before, null, false));
    }
    @GetMapping("/inquiries/for-draft/{draftId}")
    public ApiResponse<List<SupportInquiryResponse>> forDraft(Authentication auth, @PathVariable Long draftId) {
        return ApiResponse.of(persistence.forDraft(currentUserId(auth), draftId));
    }
    @GetMapping("/inquiries/{id}")
    public ApiResponse<SupportInquiryResponse> detail(Authentication auth, @PathVariable Long id) {
        return ApiResponse.of(persistence.detail(currentUserId(auth), id, false));
    }
    @GetMapping("/inquiries/{id}/image")
    public ApiResponse<JarAiGenerationPreviewResponse> image(Authentication auth, @PathVariable Long id) {
        return ApiResponse.of(service.preview(currentUserId(auth), id, false));
    }
    @PostMapping("/inquiries/general")
    public ApiResponse<SupportInquiryResponse> general(Authentication auth,@Valid @RequestBody SupportGeneralCreateRequest request) {
        return ApiResponse.of(conversations.create(SupportActor.user(currentUserId(auth)),request));
    }

    @GetMapping("/inquiries/{id}/view")
    public ApiResponse<SupportDetailResponse> view(Authentication auth,@PathVariable Long id) {
        return ApiResponse.of(conversations.view(SupportActor.user(currentUserId(auth)),id));
    }
    /* 대화는 최초 통합 조회와 별도로 이전 페이지를 이어 읽을 수 있다. */
    @GetMapping("/inquiries/{id}/messages")
    public ApiResponse<SupportMessageResponse.MessagePage> messages(Authentication auth,@PathVariable Long id,
            @RequestParam(required=false) Long before) {
        return ApiResponse.of(conversations.messages(SupportActor.user(currentUserId(auth)),id,before));
    }
    @PostMapping("/inquiries/{id}/messages")
    public ApiResponse<SupportMessageResponse> message(Authentication auth,@PathVariable Long id,
            @Valid @RequestBody SupportMessageRequest request) {
        return ApiResponse.of(conversations.append(SupportActor.user(currentUserId(auth)),id,request));
    }
    @PostMapping("/inquiries/{id}/resolve")
    public ApiResponse<SupportInquiryResponse> resolve(Authentication auth,@PathVariable Long id) {
        return ApiResponse.of(conversations.resolve(SupportActor.user(currentUserId(auth)),id,true));
    }
    @PostMapping("/inquiries/{id}/reopen")
    public ApiResponse<SupportInquiryResponse> reopen(Authentication auth,@PathVariable Long id) {
        return ApiResponse.of(conversations.resolve(SupportActor.user(currentUserId(auth)),id,false));
    }
    @GetMapping("/inquiries/{id}/attachments")
    public ApiResponse<java.util.List<SupportAttachmentResponse>> attachments(Authentication auth,@PathVariable Long id) {
        return ApiResponse.of(attachmentPersistence.list(SupportActor.user(currentUserId(auth)),id));
    }
    @PostMapping(value="/inquiries/{id}/attachments",consumes="multipart/form-data")
    public ApiResponse<SupportAttachmentResponse> upload(Authentication auth,@PathVariable Long id,
            @RequestParam java.util.UUID requestId,@RequestParam boolean shareScreenshot,
            @RequestPart("image") org.springframework.web.multipart.MultipartFile image) {
        return ApiResponse.of(attachments.upload(SupportActor.user(currentUserId(auth)),id,requestId.toString(),image,shareScreenshot));
    }
    @GetMapping("/inquiries/{id}/attachments/{attachmentId}/image")
    public ApiResponse<JarAiGenerationPreviewResponse> attachmentImage(Authentication auth,@PathVariable Long id,@PathVariable Long attachmentId) {
        return ApiResponse.of(attachments.preview(SupportActor.user(currentUserId(auth)),id,attachmentId));
    }
}
