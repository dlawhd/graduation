package shop.esjh.memoryjar.controller.ai;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;
import shop.esjh.memoryjar.dto.ai.response.JarDesignDraftCreateResponse;
import shop.esjh.memoryjar.dto.response.ApiResponse;
import shop.esjh.memoryjar.service.ai.JarDesignDraftUploadService;

import java.util.Map;

import static org.springframework.http.HttpStatus.UNAUTHORIZED;

/**
 * Canvas 또는 외부에서 전송한 원본 이미지를 받아 새 AI 디자인 Draft를 생성하는 HTTP 진입점이다.
 */
@RestController
@RequestMapping("/api/v1/design-drafts")
public class JarDesignDraftController {

    private final JarDesignDraftUploadService uploadService;

    public JarDesignDraftController(JarDesignDraftUploadService uploadService) {
        this.uploadService = uploadService;
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
