package shop.esjh.memoryjar.controller.ai;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;
import shop.esjh.memoryjar.dto.ai.response.JarDesignDraftCreateResponse;
import shop.esjh.memoryjar.dto.ai.response.JarDesignFinalizeResponse;
import shop.esjh.memoryjar.dto.ai.response.JarDesignDraftDetailResponse;
import shop.esjh.memoryjar.dto.ai.response.JarAiGenerationPreviewResponse;
import shop.esjh.memoryjar.dto.ai.request.JarAiGenerationCreateRequest;
import shop.esjh.memoryjar.dto.ai.request.JarDesignSelectionRequest;
import shop.esjh.memoryjar.dto.ai.request.JarDesignSlotRequest;
import shop.esjh.memoryjar.dto.ai.request.JarDesignCutoutRequest;
import shop.esjh.memoryjar.dto.jar.request.JarCreateRequest;
import shop.esjh.memoryjar.dto.response.ApiResponse;
import shop.esjh.memoryjar.service.ai.JarAiGenerationService;
import shop.esjh.memoryjar.service.ai.JarDesignDraftService;
import shop.esjh.memoryjar.service.ai.JarDesignFinalizeService;
import shop.esjh.memoryjar.service.ai.JarDesignDraftUploadService;
import shop.esjh.memoryjar.service.ai.JarAiGenerationPreviewService;

import java.util.Map;
import jakarta.validation.Valid;

import static org.springframework.http.HttpStatus.UNAUTHORIZED;

/**
 * Canvas 또는 외부에서 전송한 원본 이미지를 받아 새 AI 디자인 Draft를 생성하는 HTTP 진입점이다.
 */
@RestController
@RequestMapping("/api/v1/design-drafts")
public class JarDesignDraftController {

    private final JarDesignDraftUploadService uploadService;
    private final JarDesignDraftService draftService;
    private final JarAiGenerationService generationService;
    private final JarDesignFinalizeService finalizeService;
    private final JarAiGenerationPreviewService generationPreviewService;

    public JarDesignDraftController(JarDesignDraftUploadService uploadService, JarDesignDraftService draftService,
                                    JarAiGenerationService generationService, JarDesignFinalizeService finalizeService,
                                    JarAiGenerationPreviewService generationPreviewService) {
        this.uploadService = uploadService;
        this.draftService = draftService;
        this.generationService = generationService;
        this.finalizeService = finalizeService;
        this.generationPreviewService = generationPreviewService;
    }

    /** Draft와 후보 상태를 반환한다. 비공개 S3 Key·URL은 이 응답에 포함하지 않는다. */
    @GetMapping("/{draftId}")
    public ApiResponse<JarDesignDraftDetailResponse> getDraft(Authentication authentication, @PathVariable Long draftId) {
        return ApiResponse.of(draftService.getDraftSummary(extractCurrentUserId(authentication), draftId));
    }

    /** 서버 Catalog 스타일로 AI 후보 생성을 시작한다. */
    @PostMapping("/{draftId}/generations")
    public ResponseEntity<ApiResponse<Map<String, Long>>> createGeneration(Authentication authentication, @PathVariable Long draftId,
            @Valid @RequestBody JarAiGenerationCreateRequest request) {
        Long generationId = generationService.generate(extractCurrentUserId(authentication), draftId, request.style(), request.seed());
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.of(Map.of("generationId", generationId)));
    }

    /** 성공 후보를 렌더링할 때만 OWNER 전용의 짧은 수명 Presigned GET URL을 발급한다. */
    @GetMapping("/{draftId}/generations/{generationId}/preview")
    public ApiResponse<JarAiGenerationPreviewResponse> getGenerationPreview(Authentication authentication,
                                                                              @PathVariable Long draftId,
                                                                              @PathVariable Long generationId) {
        return ApiResponse.of(generationPreviewService.createPreviewUrl(
                extractCurrentUserId(authentication), draftId, generationId));
    }

    /** ORIGINAL 선택 카드도 내부 S3 Key 없이 짧은 수명 읽기 URL만 반환한다. */
    @GetMapping("/{draftId}/original/preview")
    public ApiResponse<JarAiGenerationPreviewResponse> getOriginalPreview(Authentication authentication,
                                                                            @PathVariable Long draftId) {
        return ApiResponse.of(generationPreviewService.createOriginalPreviewUrl(
                extractCurrentUserId(authentication), draftId));
    }

    /** 현재 최종 후보를 ORIGINAL·AI·DEFAULT 중 하나로 선택한다. */
    @PatchMapping("/{draftId}/selection")
    public ResponseEntity<Void> select(Authentication authentication, @PathVariable Long draftId,
                                        @Valid @RequestBody JarDesignSelectionRequest request) {
        Long userId = extractCurrentUserId(authentication);
        switch (request.designType()) {
            case ORIGINAL -> draftService.selectOriginal(userId, draftId);
            case DEFAULT -> draftService.selectDefault(userId, draftId);
            case AI -> {
                if (request.generationId() == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "AI 후보 ID가 필요합니다.");
                draftService.selectAiGeneration(userId, draftId, request.generationId());
            }
        }
        return ResponseEntity.noContent().build();
    }

    /** 선택한 커스텀 이미지의 Slot을 저장한다. */
    @PatchMapping("/{draftId}/slot")
    public ResponseEntity<Void> updateSlot(Authentication authentication, @PathVariable Long draftId,
                                           @Valid @RequestBody JarDesignSlotRequest request) {
        draftService.updateSlot(extractCurrentUserId(authentication), draftId, request.centerX(), request.centerY(), request.sizeRatio(),
                request.expectedDesignType(), request.expectedGenerationId());
        return ResponseEntity.noContent().build();
    }

    /** 선택 이미지에서 사용자가 지정한 하나 이상의 영역만 최종 PNG에 남기도록 저장한다. */
    @PatchMapping("/{draftId}/cutout")
    public ResponseEntity<Void> updateCutout(Authentication authentication, @PathVariable Long draftId,
                                             @Valid @RequestBody JarDesignCutoutRequest request) {
        draftService.updateCutoutRegions(extractCurrentUserId(authentication), draftId, request.effectiveRegions(),
                request.expectedDesignType(), request.expectedGenerationId());
        return ResponseEntity.noContent().build();
    }

    /** Draft의 최종 선택을 실제 Jar로 한 번만 확정한다. */
    @PostMapping("/{draftId}/finalize")
    public ResponseEntity<ApiResponse<JarDesignFinalizeResponse>> finalizeDraft(Authentication authentication, @PathVariable Long draftId,
            @Valid @RequestBody JarCreateRequest request) {
        var result = finalizeService.finalizeDraft(extractCurrentUserId(authentication), draftId, request);
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.of(new JarDesignFinalizeResponse(result.jarId(), result.designType())));
    }

    /**
     * multipart의 image 부분만 받으며, 파일 이름·요청 Content-Type은 서비스의 실제 바이트 검증에 사용하지 않는다.
     */
    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<ApiResponse<JarDesignDraftCreateResponse>> createDraft(
            Authentication authentication,
            @RequestParam("image") MultipartFile image
    ) {
        Long currentUserId = extractCurrentUserId(authentication);
        JarDesignDraftCreateResponse response = uploadService.uploadOriginalAndCreateDraft(currentUserId, image);
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.of(response));
    }

    private Long extractCurrentUserId(Authentication authentication) {
        if (authentication == null) {
            throw new ResponseStatusException(UNAUTHORIZED, "인증이 필요합니다.");
        }
        Object principal = authentication.getPrincipal();
        if (principal instanceof Map<?, ?> map) {
            Object userIdValue = map.get("userId");
            if (userIdValue instanceof Number userId) {
                return userId.longValue();
            }
            if (userIdValue instanceof String userId) {
                try {
                    return Long.parseLong(userId);
                } catch (NumberFormatException exception) {
                    throw new ResponseStatusException(UNAUTHORIZED, "userId 형식이 올바르지 않습니다.");
                }
            }
        }
        throw new ResponseStatusException(UNAUTHORIZED, "인증 사용자 정보를 읽을 수 없습니다.");
    }
}
