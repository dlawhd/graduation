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

/** 로그인한 사용자가 자기 실패 후보를 문의하고 자기 문의만 읽는 HTTP 진입점이다. */
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/support")
public class SupportInquiryController {
    private final SupportInquiryService service;
    private final SupportInquiryPersistenceService persistence;
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
}
