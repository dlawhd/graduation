package shop.esjh.memoryjar.controller.onboarding;

import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import shop.esjh.memoryjar.dto.onboarding.request.OnboardingProgressUpdateRequest;
import shop.esjh.memoryjar.dto.onboarding.response.OnboardingProgressItemResponse;
import shop.esjh.memoryjar.dto.onboarding.response.OnboardingProgressResponse;
import shop.esjh.memoryjar.dto.response.ApiResponse;
import shop.esjh.memoryjar.enums.onboarding.OnboardingStatus;
import shop.esjh.memoryjar.enums.onboarding.OnboardingTutorialKey;
import shop.esjh.memoryjar.service.onboarding.OnboardingService;

import java.util.Map;

import static org.springframework.http.HttpStatus.UNAUTHORIZED;

/*
 * OnboardingController 역할
 *
 * 로그인한 사용자의 온보딩 상태를 조회하고,
 * 완료 또는 건너뛰기 결과를 저장하는 API를 제공한다.
 */
@RestController
@RequestMapping("/api/v1/me/onboarding")
public class OnboardingController {

    private final OnboardingService onboardingService;

    public OnboardingController(
            OnboardingService onboardingService
    ) {
        this.onboardingService = onboardingService;
    }

    /*
     * GET /api/v1/me/onboarding
     *
     * 현재 로그인 사용자의 전체 온보딩 진행 상태를 조회한다.
     */
    @GetMapping
    public ResponseEntity<ApiResponse<OnboardingProgressResponse>>
    getMyProgress(Authentication authentication) {
        Long currentUserId =
                extractCurrentUserId(authentication);

        OnboardingProgressResponse response =
                onboardingService.getMyProgress(currentUserId);

        return ResponseEntity.ok(
                ApiResponse.of(response)
        );
    }

    /*
     * PUT /api/v1/me/onboarding/{tutorialKey}
     *
     * 특정 온보딩의 완료 또는 건너뛰기 상태를 저장한다.
     *
     * 예:
     * PUT /api/v1/me/onboarding/WELCOME
     * {
     *   "status": "COMPLETED"
     * }
     */
    @PutMapping("/{tutorialKey}")
    public ResponseEntity<ApiResponse<OnboardingProgressItemResponse>>
    finish(
            Authentication authentication,
            @PathVariable String tutorialKey,
            @Valid @RequestBody
            OnboardingProgressUpdateRequest request
    ) {
        Long currentUserId =
                extractCurrentUserId(authentication);

        OnboardingTutorialKey parsedTutorialKey =
                OnboardingTutorialKey.from(tutorialKey);

        OnboardingStatus parsedStatus =
                OnboardingStatus.from(request.status());

        OnboardingProgressItemResponse response =
                onboardingService.finish(
                        currentUserId,
                        parsedTutorialKey,
                        parsedStatus
                );

        return ResponseEntity.ok(
                ApiResponse.of(response)
        );
    }

    /*
     * Spring Security Authentication에서
     * 현재 로그인한 사용자 번호를 꺼낸다.
     */
    private Long extractCurrentUserId(
            Authentication authentication
    ) {
        if (authentication == null
                || authentication.getPrincipal() == null) {
            throw new ResponseStatusException(
                    UNAUTHORIZED,
                    "로그인이 필요해요."
            );
        }

        Object principal = authentication.getPrincipal();

        /*
         * 현재 프로젝트의 JwtAuthenticationFilter는
         * principal에 Map 형태의 사용자 정보를 저장한다.
         *
         * 예:
         * {
         *   userId=1,
         *   email=user@example.com
         * }
         */
        if (principal instanceof Map<?, ?> principalMap) {
            Object userIdValue =
                    principalMap.get("userId");

            return convertToLong(userIdValue);
        }

        // principal이 숫자로 들어온 경우도 처리한다.
        if (principal instanceof Number number) {
            return number.longValue();
        }

        throw new ResponseStatusException(
                UNAUTHORIZED,
                "로그인 사용자 정보를 확인할 수 없어요."
        );
    }

    // Object 형태의 사용자 번호를 Long으로 안전하게 변환한다.
    private Long convertToLong(Object value) {
        if (value == null) {
            throw new ResponseStatusException(
                    UNAUTHORIZED,
                    "로그인 사용자 번호가 없어요."
            );
        }

        if (value instanceof Number number) {
            return number.longValue();
        }

        try {
            return Long.parseLong(
                    String.valueOf(value)
            );
        } catch (NumberFormatException exception) {
            throw new ResponseStatusException(
                    UNAUTHORIZED,
                    "로그인 사용자 번호 형식이 올바르지 않아요."
            );
        }
    }
}