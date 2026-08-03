package shop.esjh.memoryjar.enums.onboarding;

import java.util.Locale;

/*
 * OnboardingTutorialKey 역할
 *
 * Memory Jar에서 제공하는 온보딩 안내의 종류를 관리한다.
 *
 * 문자열을 여러 곳에 직접 적지 않고 Enum으로 관리하면
 * 오타를 줄이고 백엔드와 프론트의 약속을 분명하게 만들 수 있다.
 */
public enum OnboardingTutorialKey {

    // Memory Jar 서비스 전체 이용 흐름 3장 소개
    WELCOME,

    // 저금통 목록 화면의 새 저금통 만들기 안내
    JAR_LIST,

    // 저금통 상세 화면의 쪽지, 초대, 채팅 안내
    JAR_DETAIL,

    // 저금통 오픈 후 오늘의 추억 한 장 안내
    DAILY_DRAW;

    /*
     * URL로 전달된 문자열을 안전하게 Enum으로 바꾸는 메서드
     *
     * 예:
     * "welcome" -> WELCOME
     * "JAR_LIST" -> JAR_LIST
     */
    public static OnboardingTutorialKey from(String value) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException("온보딩 종류는 필수예요.");
        }

        try {
            return OnboardingTutorialKey.valueOf(
                    value.trim().toUpperCase(Locale.ROOT)
            );
        } catch (IllegalArgumentException exception) {
            throw new IllegalArgumentException(
                    "지원하지 않는 온보딩 종류예요."
            );
        }
    }
}