package shop.esjh.memoryjar.config;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ContextConfiguration;
import org.springframework.test.context.junit.jupiter.SpringExtension;

import static org.assertj.core.api.Assertions.assertThat;

/*
 * PasswordEncoderConfigTest 역할
 *
 * Memory Jar 자체 로그인에 사용할 PasswordEncoder가
 * 실제로 안전하게 비밀번호를 Hash하고
 * 올바르게 비교하는지 확인하는 테스트야.
 *
 * 확인할 내용:
 *
 * 1. 비밀번호 원문과 Hash가 다른가?
 * 2. 올바른 비밀번호는 matches()가 true인가?
 * 3. 틀린 비밀번호는 false인가?
 * 4. 같은 비밀번호를 두 번 Hash해도 서로 다른 값이 만들어지는가?
 * 5. 생성된 Hash가 V30의 VARCHAR(255)에 충분히 들어가는가?
 */
@ExtendWith(SpringExtension.class)
@ContextConfiguration(
        classes = PasswordEncoderConfig.class
)
class PasswordEncoderConfigTest {

    /*
     * PasswordEncoderConfig에서 등록한 Bean을
     * 실제 Spring Context에서 주입받는다.
     *
     * 즉 단순히 new로 직접 만드는 테스트가 아니라
     *
     * @Bean
     *
     * 등록까지 정상적으로 됐는지 함께 확인할 수 있다.
     */
    @Autowired
    private PasswordEncoder passwordEncoder;


    @Test
    @DisplayName("비밀번호 원문은 그대로 저장되지 않고 Argon2 Hash로 변환된다")
    void encode_password_createsArgon2Hash() {

        // given
        String rawPassword =
                "Memory1234";

        // when
        String encodedPassword =
                passwordEncoder.encode(
                        rawPassword
                );

        // then

        /*
         * DB에 원문 비밀번호가 그대로 들어가면 안 된다.
         */
        assertThat(
                encodedPassword
        ).isNotEqualTo(
                rawPassword
        );

        /*
         * 우리가 사용하는 Argon2id Hash인지 확인한다.
         *
         * Argon2id Hash는 일반적으로:
         *
         * $argon2id$...
         *
         * 로 시작한다.
         */
        assertThat(
                encodedPassword
        ).startsWith(
                "$argon2id$"
        );

        /*
         * V30에서 password_hash를:
         *
         * VARCHAR(255)
         *
         * 로 만들었기 때문에
         * 생성되는 Hash가 안전하게 들어갈 수 있는지도 확인한다.
         */
        assertThat(
                encodedPassword.length()
        ).isLessThanOrEqualTo(
                255
        );
    }


    @Test
    @DisplayName("정확한 비밀번호는 저장된 Hash와 일치한다")
    void matches_correctPassword_returnsTrue() {

        // given
        String rawPassword =
                "Memory1234";

        String encodedPassword =
                passwordEncoder.encode(
                        rawPassword
                );

        // when
        boolean matches =
                passwordEncoder.matches(
                        rawPassword,
                        encodedPassword
                );

        // then
        assertThat(
                matches
        ).isTrue();
    }


    @Test
    @DisplayName("틀린 비밀번호는 저장된 Hash와 일치하지 않는다")
    void matches_wrongPassword_returnsFalse() {

        // given

        String encodedPassword =
                passwordEncoder.encode(
                        "Memory1234"
                );

        // when

        boolean matches =
                passwordEncoder.matches(
                        "WrongPassword999",
                        encodedPassword
                );

        // then

        assertThat(
                matches
        ).isFalse();
    }


    @Test
    @DisplayName("같은 비밀번호도 Hash 결과는 매번 달라진다")
    void encode_samePassword_createsDifferentHashes() {

        // given
        String rawPassword =
                "Memory1234";

        // when

        String firstHash =
                passwordEncoder.encode(
                        rawPassword
                );

        String secondHash =
                passwordEncoder.encode(
                        rawPassword
                );

        // then

        /*
         * Argon2는 매번 랜덤 Salt를 사용하기 때문에
         * 같은 비밀번호라도 Hash 문자열은 달라져야 한다.
         */
        assertThat(
                firstHash
        ).isNotEqualTo(
                secondHash
        );


        /*
         * Hash 문자열은 서로 달라도
         * 둘 다 같은 원래 비밀번호를 가지고 만든 Hash이므로
         * matches()는 둘 다 true여야 한다.
         */
        assertThat(
                passwordEncoder.matches(
                        rawPassword,
                        firstHash
                )
        ).isTrue();

        assertThat(
                passwordEncoder.matches(
                        rawPassword,
                        secondHash
                )
        ).isTrue();
    }
}