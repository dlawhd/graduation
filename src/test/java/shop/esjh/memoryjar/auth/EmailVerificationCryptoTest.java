package shop.esjh.memoryjar.auth;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import shop.esjh.memoryjar.enums.auth.EmailVerificationPurpose;

import static org.assertj.core.api.Assertions.assertThat;

/*
 * EmailVerificationCryptoTest 역할
 *
 * 이메일 인증번호가 HMAC-SHA256으로
 * 안전하게 Hash되는지 확인한다.
 */
class EmailVerificationCryptoTest {

    /*
     * 테스트 전용 Secret
     *
     * 실제 운영 Secret을 사용하면 안 된다.
     */
    private static final String TEST_SECRET =
            "test-email-verification-secret-key-123456789";


    private final EmailVerificationCrypto crypto =
            new EmailVerificationCrypto(
                    TEST_SECRET
            );


    @Test
    @DisplayName("인증번호는 64자리 HMAC-SHA256 Hash로 변환된다")
    void hashCode_creates64CharacterHash() {

        // when
        String hash =
                crypto.hashCode(
                        "eunseo@naver.com",
                        EmailVerificationPurpose.SIGNUP,
                        "482193"
                );

        // then

        /*
         * 원본 인증번호와 달라야 한다.
         */
        assertThat(
                hash
        ).isNotEqualTo(
                "482193"
        );

        /*
         * SHA-256 Hex 결과는 64글자다.
         */
        assertThat(
                hash
        ).hasSize(
                64
        );
    }


    @Test
    @DisplayName("같은 이메일, 목적, 인증번호는 같은 Hash를 만든다")
    void sameInput_createsSameHash() {

        String first =
                crypto.hashCode(
                        "eunseo@naver.com",
                        EmailVerificationPurpose.SIGNUP,
                        "482193"
                );

        String second =
                crypto.hashCode(
                        "eunseo@naver.com",
                        EmailVerificationPurpose.SIGNUP,
                        "482193"
                );

        assertThat(
                first
        ).isEqualTo(
                second
        );
    }


    @Test
    @DisplayName("정확한 인증번호는 저장된 Hash와 일치한다")
    void matches_correctCode_returnsTrue() {

        String hash =
                crypto.hashCode(
                        "eunseo@naver.com",
                        EmailVerificationPurpose.SIGNUP,
                        "482193"
                );

        boolean result =
                crypto.matches(
                        "eunseo@naver.com",
                        EmailVerificationPurpose.SIGNUP,
                        "482193",
                        hash
                );

        assertThat(
                result
        ).isTrue();
    }


    @Test
    @DisplayName("틀린 인증번호는 저장된 Hash와 일치하지 않는다")
    void matches_wrongCode_returnsFalse() {

        String hash =
                crypto.hashCode(
                        "eunseo@naver.com",
                        EmailVerificationPurpose.SIGNUP,
                        "482193"
                );

        boolean result =
                crypto.matches(
                        "eunseo@naver.com",
                        EmailVerificationPurpose.SIGNUP,
                        "111111",
                        hash
                );

        assertThat(
                result
        ).isFalse();
    }
}