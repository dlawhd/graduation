package shop.esjh.memoryjar.enums.onboarding;

import java.util.Locale;

/*
 * OnboardingStatus 역할
 *
 * 사용자가 온보딩을 어떻게 끝냈는지 관리한다.
 *
 * COMPLETED:
 * 마지막 단계까지 보고 완료한 상태
 *
 * SKIPPED:
 * 건너뛰기 버튼을 눌러 종료한 상태
 */
public enum OnboardingStatus {

    COMPLETED,
    SKIPPED;

    /*
     * 프론트에서 받은 문자열을 안전하게 Enum으로 바꾸는 메서드
     */
    public static OnboardingStatus from(String value) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException("온보딩 상태는 필수예요.");
        }

        try {
            return OnboardingStatus.valueOf(
                    value.trim().toUpperCase(Locale.ROOT)
            );
        } catch (IllegalArgumentException exception) {
            throw new IllegalArgumentException(
                    "지원하지 않는 온보딩 상태예요."
            );
        }
    }
}