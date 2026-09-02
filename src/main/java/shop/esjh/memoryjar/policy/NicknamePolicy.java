package shop.esjh.memoryjar.policy;

import org.springframework.util.StringUtils;

import java.util.regex.Pattern;

/*
 * NicknamePolicy 역할
 *
 * Memory Jar에서 사용하는 닉네임 규칙을
 * 한곳에서 관리하는 클래스야.
 *
 *
 * 허용 문자:
 *
 * - 한글
 * - 영문
 * - 숫자
 *
 * 특수문자와 중간 공백은 사용할 수 없다.
 *
 *
 * 길이 계산:
 *
 * 한글 1자      = 2칸
 * 영문/숫자 1자 = 1칸
 *
 * 최대 16칸
 *
 *
 * 따라서:
 *
 * 은서은서은서은서
 * → 한글 8자 = 16칸
 *
 * memoryjar1234567
 * → 영문/숫자 16자 = 16칸
 */
public final class NicknamePolicy {

    /*
     * 닉네임에서 허용하는 문자
     */
    private static final Pattern
            NICKNAME_PATTERN =
            Pattern.compile(
                    "^[가-힣A-Za-z0-9]+$"
            );


    /*
     * 최대로 사용할 수 있는
     * 닉네임 길이 점수
     */
    public static final int
            MAX_NICKNAME_UNITS = 16;


    private NicknamePolicy() {
    }


    /*
     * 닉네임을 정리하고 검증한다.
     */
    public static String
    normalizeAndValidate(
            String nickname
    ) {

        /*
         * null / 빈 문자열 / 공백만 있는 값 차단
         */
        if (!StringUtils.hasText(
                nickname
        )) {

            throw new IllegalArgumentException(
                    "닉네임을 입력해 주세요."
            );
        }


        /*
         * 앞뒤 공백 제거
         */
        String normalized =
                nickname.trim();


        /*
         * 특수문자 / 중간 공백 차단
         */
        if (
                !NICKNAME_PATTERN
                        .matcher(
                                normalized
                        )
                        .matches()
        ) {

            throw new IllegalArgumentException(
                    "닉네임은 한글, 영문, 숫자만 사용할 수 있어요."
            );
        }


        /*
         * 한글 2점,
         * 영문/숫자 1점으로 계산한다.
         */
        int units =
                normalized
                        .codePoints()
                        .map(
                                NicknamePolicy
                                        ::nicknameUnit
                        )
                        .sum();


        /*
         * 총 16칸을 넘을 수 없다.
         */
        if (
                units >
                        MAX_NICKNAME_UNITS
        ) {

            throw new IllegalArgumentException(
                    "닉네임은 한글 8자 또는 영문과 숫자 16자 이내로 입력해 주세요."
            );
        }


        return normalized;
    }


    /*
     * 한 문자당 몇 칸인지 계산한다.
     */
    private static int nicknameUnit(
            int codePoint
    ) {

        /*
         * 한글 완성형 범위
         *
         * 가 ~ 힣
         */
        boolean isHangul =
                codePoint >= 0xAC00 &&
                        codePoint <= 0xD7A3;


        return isHangul
                ? 2
                : 1;
    }
}