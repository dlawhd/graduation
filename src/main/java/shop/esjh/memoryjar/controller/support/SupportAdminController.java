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
}
