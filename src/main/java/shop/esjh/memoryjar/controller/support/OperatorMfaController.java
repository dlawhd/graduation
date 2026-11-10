package shop.esjh.memoryjar.controller.support;

import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import shop.esjh.memoryjar.dto.response.ApiResponse;
import shop.esjh.memoryjar.service.support.OperatorMfaService;

/** 운영자 인증 앱 등록과 확인만 처리한다. 기존 로그인·CSRF 검사는 유지하며 비밀 응답은 캐시하지 않는다. */
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/admin/support/mfa")
public class OperatorMfaController {
    private final OperatorMfaService service;
    public record EnrollRequest(@NotBlank @Size(min = 32, max = 256) String bootstrapCode) {}
    public record CodeRequest(@NotBlank @Pattern(regexp = "[0-9]{6}") String code) {}
    public record VerifyRequest(@NotBlank @Pattern(regexp = "(?:[0-9]{6}|[a-fA-F0-9]{32})") String code, boolean recovery) {}

    @ModelAttribute
    void noStore(HttpServletResponse response) {
        response.setHeader("Cache-Control", "no-store");
        response.setHeader("Pragma", "no-cache");
        response.setHeader("Referrer-Policy", "no-referrer");
    }
    @GetMapping
    public ApiResponse<OperatorMfaService.State> status(Authentication auth) { return ApiResponse.of(service.status(auth)); }
    @PostMapping("/enrollment")
    public ApiResponse<OperatorMfaService.Enrollment> enroll(Authentication auth, @Valid @RequestBody EnrollRequest request) {
        return ApiResponse.of(service.enroll(auth, request.bootstrapCode()));
    }
    @PostMapping("/confirmation")
    public ApiResponse<OperatorMfaService.Result> confirm(Authentication auth, @Valid @RequestBody CodeRequest request) {
        return ApiResponse.of(service.confirm(auth, request.code()));
    }
    @PostMapping("/verification")
    public ApiResponse<OperatorMfaService.Result> verify(Authentication auth, @Valid @RequestBody VerifyRequest request) {
        return ApiResponse.of(service.verify(auth, request.code(), request.recovery()));
    }
    @PostMapping("/recovery-codes")
    public ApiResponse<OperatorMfaService.Result> recovery(Authentication auth, @Valid @RequestBody CodeRequest request) {
        return ApiResponse.of(service.regenerateRecovery(auth, request.code()));
    }
    @PostMapping("/lock")
    public ApiResponse<Map<String, Boolean>> lock(Authentication auth) {
        service.lock(auth); return ApiResponse.of(Map.of("locked", true));
    }
}
