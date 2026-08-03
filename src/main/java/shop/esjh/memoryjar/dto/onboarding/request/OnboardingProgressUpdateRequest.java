package shop.esjh.memoryjar.dto.onboarding.request;

import jakarta.validation.constraints.NotBlank;

/*
 * OnboardingProgressUpdateRequest 역할
 *
 * 프론트에서 사용자가 온보딩을 완료했는지
 * 건너뛰었는지 전달받는 요청 DTO다.
 */
public record OnboardingProgressUpdateRequest(

        @NotBlank(message = "온보딩 상태는 필수예요.")
        String status
) {
}