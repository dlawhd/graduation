package shop.esjh.memoryjar.service;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.password.PasswordEncoder;
import shop.esjh.memoryjar.dto.auth.response.LoginIdAvailabilityResponse;
import shop.esjh.memoryjar.entity.User;
import shop.esjh.memoryjar.entity.UserOAuthAccount;
import shop.esjh.memoryjar.repository.UserLocalCredentialRepository;
import shop.esjh.memoryjar.repository.UserOAuthAccountRepository;
import shop.esjh.memoryjar.repository.UserRepository;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.*;

/*
 * LocalAuthServiceTest 역할
 *
 * Memory Jar 자체 로그인 서비스의
 * 아이디 중복 확인 로직을 테스트한다.
 *
 * 확인하는 내용:
 *
 * 1. 사용하지 않은 아이디 → available = true
 * 2. 이미 사용된 아이디 → available = false
 * 3. 대문자/공백 → 소문자로 정규화
 * 4. 잘못된 아이디 → 400으로 바뀔 IllegalArgumentException 발생
 */
@ExtendWith(MockitoExtension.class)
class LocalAuthServiceTest {

    @Mock
    private UserLocalCredentialRepository
            userLocalCredentialRepository;

    @Mock
    private UserRepository
            userRepository;

    @Mock
    private EmailVerificationService
            emailVerificationService;

    @Mock
    private PasswordEncoder
            passwordEncoder;

    /*
     * 사용자의 NAVER / GOOGLE / KAKAO
     * 연결 정보를 가짜 DB처럼 반환한다.
     */
    @Mock
    private UserOAuthAccountRepository
            userOAuthAccountRepository;

    @InjectMocks
    private LocalAuthService localAuthService;




    @Test
    @DisplayName("한 번도 사용되지 않은 아이디는 사용 가능하다")
    void availableLoginId_returnsTrue() {

        // given
        when(
                userLocalCredentialRepository
                        .countIncludingDeletedByLoginId(
                                "eunseo01"
                        )
        ).thenReturn(0L);


        // when
        LoginIdAvailabilityResponse response =
                localAuthService
                        .checkLoginIdAvailability(
                                "eunseo01"
                        );


        // then
        assertThat(
                response.loginId()
        ).isEqualTo(
                "eunseo01"
        );

        assertThat(
                response.available()
        ).isTrue();
    }


    @Test
    @DisplayName("이미 사용된 아이디는 사용할 수 없다")
    void duplicatedLoginId_returnsFalse() {

        // given
        when(
                userLocalCredentialRepository
                        .countIncludingDeletedByLoginId(
                                "eunseo01"
                        )
        ).thenReturn(1L);


        // when
        LoginIdAvailabilityResponse response =
                localAuthService
                        .checkLoginIdAvailability(
                                "eunseo01"
                        );


        // then
        assertThat(
                response.available()
        ).isFalse();
    }


    @Test
    @DisplayName("아이디는 앞뒤 공백을 제거하고 소문자로 검사한다")
    void loginId_isNormalized() {

        // given
        when(
                userLocalCredentialRepository
                        .countIncludingDeletedByLoginId(
                                "eunseo01"
                        )
        ).thenReturn(0L);


        // when
        LoginIdAvailabilityResponse response =
                localAuthService
                        .checkLoginIdAvailability(
                                "  EunSeo01  "
                        );


        // then
        assertThat(
                response.loginId()
        ).isEqualTo(
                "eunseo01"
        );

        /*
         * Repository에도 정리된 아이디가
         * 전달됐는지 확인한다.
         */
        verify(
                userLocalCredentialRepository
        ).countIncludingDeletedByLoginId(
                "eunseo01"
        );
    }


    @Test
    @DisplayName("아이디가 비어 있으면 예외가 발생한다")
    void blankLoginId_throwsException() {

        assertThatThrownBy(
                () -> localAuthService
                        .checkLoginIdAvailability(
                                "   "
                        )
        )
                .isInstanceOf(
                        IllegalArgumentException.class
                )
                .hasMessage(
                        "아이디를 입력해 주세요."
                );

        /*
         * 형식 자체가 잘못됐으므로
         * DB까지 조회할 필요가 없다.
         */
        verifyNoInteractions(
                userLocalCredentialRepository
        );
    }


    @Test
    @DisplayName("허용하지 않는 문자가 포함된 아이디는 예외가 발생한다")
    void invalidLoginId_throwsException() {

        assertThatThrownBy(
                () -> localAuthService
                        .checkLoginIdAvailability(
                                "은서!!"
                        )
        )
                .isInstanceOf(
                        IllegalArgumentException.class
                );

        verifyNoInteractions(
                userLocalCredentialRepository
        );
    }

    @Test
    @DisplayName(
            "한 번도 사용되지 않은 이메일은 신규 계정으로 판단한다"
    )
    void newEmail_returnsNewAccount() {

        // given
        when(
                userRepository
                        .countIncludingDeletedByEmail(
                                "new@example.com"
                        )
        ).thenReturn(
                0L
        );


        // when
        LocalAuthService
                .ExistingAccountLoginMethods result =
                localAuthService
                        .findExistingAccountLoginMethods(
                                " New@Example.com "
                        );


        // then
        assertThat(
                result.existingAccount()
        ).isFalse();

        assertThat(
                result.loginMethods()
        ).isEmpty();


        /*
         * 신규 이메일이라고 이미 확인됐으므로
         * User/OAuth 정보를 추가 조회할 필요가 없다.
         */
        verify(
                userRepository,
                never()
        ).findByEmail(
                anyString()
        );

        verifyNoInteractions(
                userOAuthAccountRepository
        );
    }

    @Test
    @DisplayName(
            "기존 NAVER 계정 이메일이면 NAVER 로그인 방법을 반환한다"
    )
    void existingNaverEmail_returnsNaver() {

        // given
        User user =
                User.builder()
                        .id(10L)
                        .email(
                                "eunseo@naver.com"
                        )
                        .name(
                                "은서"
                        )
                        .provider(
                                null
                        )
                        .providerId(
                                null
                        )
                        .build();


        UserOAuthAccount naverAccount =
                mock(
                        UserOAuthAccount.class
                );

        when(
                naverAccount
                        .getProvider()
        ).thenReturn(
                "NAVER"
        );


        when(
                userRepository
                        .countIncludingDeletedByEmail(
                                "eunseo@naver.com"
                        )
        ).thenReturn(
                1L
        );

        when(
                userRepository
                        .findByEmail(
                                "eunseo@naver.com"
                        )
        ).thenReturn(
                Optional.of(
                        user
                )
        );

        /*
         * 이 사용자는 LOCAL 아이디 로그인은 없음.
         */
        when(
                userLocalCredentialRepository
                        .findByUser_Id(
                                10L
                        )
        ).thenReturn(
                Optional.empty()
        );

        /*
         * NAVER OAuth 계정이 연결되어 있음.
         */
        when(
                userOAuthAccountRepository
                        .findAllByUser_Id(
                                10L
                        )
        ).thenReturn(
                List.of(
                        naverAccount
                )
        );


        // when
        LocalAuthService
                .ExistingAccountLoginMethods result =
                localAuthService
                        .findExistingAccountLoginMethods(
                                "eunseo@naver.com"
                        );


        // then
        assertThat(
                result.existingAccount()
        ).isTrue();

        assertThat(
                result.loginMethods()
        ).containsExactly(
                "NAVER"
        );
    }
    /*
     * =========================================================
     * 회원가입 비밀번호 정책 테스트
     * =========================================================
     *
     * 아래 세 비밀번호는 각각
     * 필수 조건 하나가 빠져 있다.
     *
     * memory1234
     * → 특수문자 없음
     *
     * memory!!!!
     * → 숫자 없음
     *
     * 12345678!
     * → 영문 없음
     *
     * 세 경우 모두 회원가입이 중단되어야 한다.
     */
    @ParameterizedTest
    @ValueSource(
            strings = {
                    "memory1234",
                    "memory!!!!",
                    "12345678!"
            }
    )
    @DisplayName(
            "회원가입 비밀번호는 영문, 숫자, 특수문자를 각각 포함해야 한다"
    )
    void signupPassword가_필수문자를_포함하지_않으면_예외(
            String invalidPassword
    ) {

        /*
         * when & then
         *
         * 잘못된 비밀번호로 회원가입을 시도하면
         * IllegalArgumentException이 발생하는지 확인한다.
         */
        assertThatThrownBy(
                () ->
                        localAuthService.signup(
                                "eunseo01",
                                invalidPassword,
                                "은서",
                                "eunseo@example.com",
                                "verification-token"
                        )
        )
                .isInstanceOf(
                        IllegalArgumentException.class
                )
                .hasMessage(
                        "비밀번호는 영문, 숫자, 특수문자를 각각 1자 이상 포함해 주세요."
                );

        /*
         * 비밀번호 단계에서 이미 실패했기 때문에
         *
         * DB 조회
         * 이메일 인증 토큰 사용
         * 비밀번호 Hash 생성
         *
         * 단계까지 넘어가면 안 된다.
         */
        verifyNoInteractions(
                userLocalCredentialRepository,
                userRepository,
                emailVerificationService,
                passwordEncoder
        );
    }
}