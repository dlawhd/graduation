package shop.esjh.memoryjar.controller.file;

import shop.esjh.memoryjar.dto.file.request.FileCompleteRequest;
import shop.esjh.memoryjar.dto.file.request.FilePresignRequest;
import shop.esjh.memoryjar.dto.file.response.FileCompleteResponse;
import shop.esjh.memoryjar.dto.file.response.FilePresignResponse;
import shop.esjh.memoryjar.dto.response.ApiResponse;
import shop.esjh.memoryjar.service.file.FileService;
import jakarta.validation.Valid;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.Map;

import static org.springframework.http.HttpStatus.UNAUTHORIZED;

// 이 컨트롤러는 파일 업로드 관련 요청을 받는 역할을 해.
// presign: 업로드 티켓 발급
// complete: 실제 업로드 완료 확인
@RestController
@RequestMapping("/api/v1/files")
public class FileController {

    private final FileService fileService;

    public FileController(FileService fileService) {
        this.fileService = fileService;
    }

    @PostMapping("/presign")
    public ApiResponse<FilePresignResponse> createPresignedUrl(
            Authentication authentication,
            @Valid @RequestBody FilePresignRequest request
    ) {
        Long currentUserId = extractCurrentUserId(authentication);
        FilePresignResponse response = fileService.createPresignedUrl(currentUserId, request);
        return ApiResponse.of(response);
    }

    @PostMapping("/complete")
    public ApiResponse<FileCompleteResponse> completeUpload(
            Authentication authentication,
            @Valid @RequestBody FileCompleteRequest request
    ) {
        Long currentUserId = extractCurrentUserId(authentication);
        FileCompleteResponse response = fileService.completeUpload(currentUserId, request);
        return ApiResponse.of(response);
    }

    private Long extractCurrentUserId(Authentication authentication) {
        if (authentication == null) {
            throw new ResponseStatusException(UNAUTHORIZED, "인증이 필요합니다.");
        }

        Object principal = authentication.getPrincipal();

        if (principal instanceof Map<?, ?> map) {
            Object userIdValue = map.get("userId");

            if (userIdValue instanceof Long userId) {
                return userId;
            }
            if (userIdValue instanceof Integer userId) {
                return userId.longValue();
            }
            if (userIdValue instanceof String userId) {
                try {
                    return Long.parseLong(userId);
                } catch (NumberFormatException e) {
                    throw new ResponseStatusException(UNAUTHORIZED, "userId 형식이 올바르지 않습니다.");
                }
            }
        }

        throw new ResponseStatusException(UNAUTHORIZED, "인증 사용자 정보를 읽을 수 없습니다.");
    }
}