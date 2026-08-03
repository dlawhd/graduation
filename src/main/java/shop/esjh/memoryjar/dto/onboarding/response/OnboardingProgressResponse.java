package shop.esjh.memoryjar.dto.onboarding.response;

import java.util.List;

/*
 * OnboardingProgressResponse 역할
 *
 * 현재 사용자의 온보딩 버전과
 * 모든 온보딩 종류의 진행 상태를 묶어서 반환한다.
 *
 */
public record OnboardingProgressResponse(

        // 현재 서버가 사용하는 온보딩 버전
        int version,

        // WELCOME, JAR_LIST, JAR_DETAIL, DAILY_DRAW 상태
        List<OnboardingProgressItemResponse> items
) {
}