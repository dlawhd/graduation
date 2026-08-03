package shop.esjh.memoryjar.dto.onboarding.response;

import shop.esjh.memoryjar.enums.onboarding.OnboardingStatus;
import shop.esjh.memoryjar.enums.onboarding.OnboardingTutorialKey;

import java.time.LocalDateTime;

/*
 * OnboardingProgressItemResponse 역할
 *
 * 온보딩 종류 하나의 현재 진행 상태를 프론트에 전달한다.
 */
public record OnboardingProgressItemResponse(

        // 어떤 온보딩인지
        OnboardingTutorialKey tutorialKey,

        // 완료 또는 건너뛰기 기록이 존재하는지
        boolean handled,

        // 아직 보지 않았다면 null
        OnboardingStatus status,

        // 아직 보지 않았다면 null
        LocalDateTime finishedAt
) {
}