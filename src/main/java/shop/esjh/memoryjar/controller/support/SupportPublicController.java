package shop.esjh.memoryjar.controller.support;

import jakarta.servlet.http.*;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;
import org.springframework.http.*;
import shop.esjh.memoryjar.service.support.*;
import shop.esjh.memoryjar.dto.support.*;
import shop.esjh.memoryjar.dto.response.ApiResponse;
import shop.esjh.memoryjar.dto.ai.response.JarAiGenerationPreviewResponse;
import java.time.Duration;
import java.util.List;

/** 공개 도움말과 계정 로그인 없이 사용하는 문의다. 모든 개인 조회/변경에서 문의 전용 쿠키를 검사한다. */
@RestController @RequiredArgsConstructor @RequestMapping("/api/v1/public/support")
public class SupportPublicController {
    private final SupportFaqService faq;
    private final SupportGuestService guests;
    private final SupportGuestCookieService cookies;
    private final SupportConversationService conversations;
    private final SupportAttachmentService attachments;
    private final SupportAttachmentPersistenceService attachmentPersistence;
    @GetMapping("/faq")
    public ResponseEntity<ApiResponse<List<SupportFaqService.Faq>>> faq() {
        return ResponseEntity.ok().cacheControl(CacheControl.maxAge(Duration.ofMinutes(5)).cachePublic()).body(ApiResponse.of(faq.items()));
    }
    @GetMapping("/session")
    public ApiResponse<SupportGuestService.GuestStatus> session(@CookieValue(value=SupportGuestCookieService.COOKIE,required=false) String token) {
        return ApiResponse.of(guests.status(token));
    }
    @PostMapping("/session")
    public ApiResponse<SupportGuestService.GuestStatus> session(@CookieValue(value=SupportGuestCookieService.COOKIE,required=false) String token,
            HttpServletRequest request,HttpServletResponse response) {
        var issue=guests.issue(token,request.getRemoteAddr()); cookies.write(response,issue);
        return ApiResponse.of(new SupportGuestService.GuestStatus(true,issue.expiresAt()));
    }
    @PostMapping("/inquiries")
    public ApiResponse<SupportInquiryResponse> create(@CookieValue(value=SupportGuestCookieService.COOKIE,required=false) String token,
            @Valid @RequestBody SupportGeneralCreateRequest request) {
        return ApiResponse.of(conversations.create(guests.require(token),request));
    }
    @GetMapping("/inquiries")
    public ApiResponse<SupportInquiryResponse.InquiryPage> list(@CookieValue(value=SupportGuestCookieService.COOKIE,required=false) String token,
            @RequestParam(required=false) Long before) {
        return ApiResponse.of(conversations.guestList(guests.require(token),before));
    }
    @GetMapping("/inquiries/{id}")
    public ApiResponse<SupportInquiryResponse> detail(@CookieValue(value=SupportGuestCookieService.COOKIE,required=false) String token,@PathVariable Long id) {
        return ApiResponse.of(conversations.detail(guests.require(token),id));
    }
    @GetMapping("/inquiries/{id}/view")
    public ApiResponse<SupportDetailResponse> view(@CookieValue(value=SupportGuestCookieService.COOKIE,required=false) String token,@PathVariable Long id) {
        return ApiResponse.of(conversations.view(guests.require(token),id));
    }
    @GetMapping("/inquiries/{id}/messages")
    public ApiResponse<SupportMessageResponse.MessagePage> messages(@CookieValue(value=SupportGuestCookieService.COOKIE,required=false) String token,
            @PathVariable Long id,@RequestParam(required=false) Long before) {
        return ApiResponse.of(conversations.messages(guests.require(token),id,before));
    }
    @PostMapping("/inquiries/{id}/messages")
    public ApiResponse<SupportMessageResponse> message(@CookieValue(value=SupportGuestCookieService.COOKIE,required=false) String token,
            @PathVariable Long id,@Valid @RequestBody SupportMessageRequest request) {
        return ApiResponse.of(conversations.append(guests.require(token),id,request));
    }
    @PostMapping("/inquiries/{id}/resolve")
    public ApiResponse<SupportInquiryResponse> resolve(@CookieValue(value=SupportGuestCookieService.COOKIE,required=false) String token,@PathVariable Long id) {
        return ApiResponse.of(conversations.resolve(guests.require(token),id,true));
    }
    @PostMapping("/inquiries/{id}/reopen")
    public ApiResponse<SupportInquiryResponse> reopen(@CookieValue(value=SupportGuestCookieService.COOKIE,required=false) String token,@PathVariable Long id) {
        return ApiResponse.of(conversations.resolve(guests.require(token),id,false));
    }
    @GetMapping("/inquiries/{id}/attachments")
    public ApiResponse<List<SupportAttachmentResponse>> attachments(@CookieValue(value=SupportGuestCookieService.COOKIE,required=false) String token,@PathVariable Long id) {
        return ApiResponse.of(attachmentPersistence.list(guests.require(token),id));
    }
    @PostMapping(value="/inquiries/{id}/attachments",consumes="multipart/form-data")
    public ApiResponse<SupportAttachmentResponse> upload(@CookieValue(value=SupportGuestCookieService.COOKIE,required=false) String token,@PathVariable Long id,
            @RequestParam java.util.UUID requestId,@RequestParam boolean shareScreenshot,
            @RequestPart("image") org.springframework.web.multipart.MultipartFile image) {
        return ApiResponse.of(attachments.upload(guests.require(token),id,requestId.toString(),image,shareScreenshot));
    }
    @GetMapping("/inquiries/{id}/attachments/{attachmentId}/image")
    public ApiResponse<JarAiGenerationPreviewResponse> image(@CookieValue(value=SupportGuestCookieService.COOKIE,required=false) String token,
            @PathVariable Long id,@PathVariable Long attachmentId) {
        return ApiResponse.of(attachments.preview(guests.require(token),id,attachmentId));
    }
}
