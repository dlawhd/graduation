package shop.esjh.memoryjar.service;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.server.ResponseStatusException;
import shop.esjh.memoryjar.dto.auth.response.LoginIdAvailabilityResponse;
import shop.esjh.memoryjar.entity.User;
import shop.esjh.memoryjar.entity.UserLocalCredential;
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
 * Memory Jar 자체 계정(LOCAL)의
 * 핵심 인증 로직을 테스트하는 클래스야.
 *
 * 쉽게 말하면:
 *
 * "아이디를 사용할 수 있는가?"
 * "아이디와 비밀번호가 맞는가?"
 * "회원가입 비밀번호 규칙을 지켰는가?"
 *
 * 를 가짜 Repository와 PasswordEncoder를 이용해
 * 빠르고 독립적으로 확인한다.
 *
 *
 * 주요 테스트 범위:
 *
 * 1. 사용하지 않은 아이디 → 사용 가능
 * 2. 이미 사용된 아이디 → 사용 불가
 * 3. 아이디 앞뒤 공백/대문자 정규화
 * 4. 잘못된 아이디 형식 차단
 * 5. LOCAL 아이디 + 비밀번호 로그인 성공
 * 6. 존재하지 않는 LOCAL 아이디 로그인 차단
 * 7. 잘못된 비밀번호 로그인 차단
 * 8. 회원가입 비밀번호 정책 검증
 *
 *
 * 중요한 점:
 *
 * 실제 DB나 실제 Argon2 연산을 사용하는 테스트가 아니라
 * Mockito를 이용한 LocalAuthService의 단위 테스트다.
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

    /*
     * 비밀번호 재설정 성공 후
     * 모든 Refresh Token 폐기 기능 테스트용 Mock
     */
    @Mock
    private RefreshTokenService
            refreshTokenService;

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

    /*
     * =========================================================
     * LOCAL 로그인 테스트
     * =========================================================
     *
     * 여기부터는 실제 Memory Jar의:
     *
     * 아이디 + 비밀번호
     *
     * 로그인 로직을 검사한다.
     */


    @Test
    @DisplayName(
            "올바른 아이디와 비밀번호이면 LOCAL 로그인에 성공한다"
    )
    void localLogin_success() {

        /*
         * =====================================================
         * given
         * =====================================================
         *
         * DB에 아래 LOCAL 사용자가 있다고 가정한다.
         *
         * 아이디:
         * eunseo01
         *
         * 실제 비밀번호:
         * Memory123!
         *
         * DB에는 실제 비밀번호가 아니라:
         * encoded-password
         *
         * 같은 Hash만 저장되어 있다고 가정한다.
         */

        User user =
                User.builder()
                        .id(
                                10L
                        )
                        .email(
                                "eunseo@example.com"
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


        /*
         * User #10의
         * LOCAL 로그인 정보
         */
        UserLocalCredential credential =
                UserLocalCredential
                        .builder()
                        .user(
                                user
                        )
                        .loginId(
                                "eunseo01"
                        )
                        .passwordHash(
                                "encoded-password"
                        )
                        .build();


        /*
         * Repository에서 eunseo01을 찾으면
         * 위에서 만든 Credential을 반환한다고 설정한다.
         */
        when(
                userLocalCredentialRepository
                        .findByLoginId(
                                "eunseo01"
                        )
        ).thenReturn(
                Optional.of(
                        credential
                )
        );


        /*
         * PasswordEncoder에게:
         *
         * 사용자가 입력한 Memory123!
         *
         * 과
         *
         * DB의 encoded-password
         *
         * 가 같은 비밀번호라고 가정하게 한다.
         */
        when(
                passwordEncoder.matches(
                        "Memory123!",
                        "encoded-password"
                )
        ).thenReturn(
                true
        );


        /*
         * =====================================================
         * when
         * =====================================================
         *
         * 실제 LOCAL 로그인 실행
         */
        LocalAuthService.LocalAuthResult result =
                localAuthService.login(
                        "eunseo01",
                        "Memory123!"
                );


        /*
         * =====================================================
         * then
         * =====================================================
         */

        /*
         * 로그인 결과의 User가
         * 우리가 만든 User와 같은지 확인한다.
         */
        assertThat(
                result.user()
        ).isSameAs(
                user
        );


        /*
         * 로그인 결과의 아이디도
         * 정확한지 확인한다.
         */
        assertThat(
                result.loginId()
        ).isEqualTo(
                "eunseo01"
        );


        /*
         * Repository에서 아이디를 실제로 조회했는지 확인
         */
        verify(
                userLocalCredentialRepository
        ).findByLoginId(
                "eunseo01"
        );


        /*
         * 비밀번호 Hash 비교가 실제로 실행됐는지 확인
         */
        verify(
                passwordEncoder
        ).matches(
                "Memory123!",
                "encoded-password"
        );


        /*
         * 로그인은 기존 User를 찾는 과정이므로
         * 회원가입용 Repository나 이메일 인증 서비스는
         * 사용하면 안 된다.
         */
        verifyNoInteractions(
                userRepository,
                emailVerificationService,
                userOAuthAccountRepository
        );
    }

    @Test
    @DisplayName(
            "LOCAL 로그인 아이디는 앞뒤 공백을 제거하고 소문자로 조회한다"
    )
    void localLogin_loginIdIsNormalized() {

        /*
         * =====================================================
         * given
         * =====================================================
         */

        User user =
                User.builder()
                        .id(
                                10L
                        )
                        .email(
                                "eunseo@example.com"
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


        UserLocalCredential credential =
                UserLocalCredential
                        .builder()
                        .user(
                                user
                        )
                        .loginId(
                                "eunseo01"
                        )
                        .passwordHash(
                                "encoded-password"
                        )
                        .build();


        /*
         * 실제 DB에는 항상 정규화된
         * eunseo01이 저장되어 있다고 가정한다.
         */
        when(
                userLocalCredentialRepository
                        .findByLoginId(
                                "eunseo01"
                        )
        ).thenReturn(
                Optional.of(
                        credential
                )
        );


        when(
                passwordEncoder.matches(
                        "Memory123!",
                        "encoded-password"
                )
        ).thenReturn(
                true
        );


        /*
         * =====================================================
         * when
         * =====================================================
         *
         * 사용자는 대문자와 앞뒤 공백을 넣었다.
         */
        LocalAuthService.LocalAuthResult result =
                localAuthService.login(
                        "  EunSeo01  ",
                        "Memory123!"
                );


        /*
         * =====================================================
         * then
         * =====================================================
         *
         * 서버에서는:
         *
         * "  EunSeo01  "
         *       ↓
         * "eunseo01"
         *
         * 로 정리해서 사용해야 한다.
         */
        assertThat(
                result.loginId()
        ).isEqualTo(
                "eunseo01"
        );


        /*
         * Repository에도 반드시
         * 정리된 아이디가 전달됐는지 확인한다.
         */
        verify(
                userLocalCredentialRepository
        ).findByLoginId(
                "eunseo01"
        );
    }

    @Test
    @DisplayName(
            "존재하지 않는 LOCAL 아이디로 로그인하면 401 예외가 발생한다"
    )
    void localLogin_unknownLoginId_throwsUnauthorized() {

        /*
         * =====================================================
         * given
         * =====================================================
         *
         * unknown01이라는 아이디는 DB에 없다.
         */
        when(
                userLocalCredentialRepository
                        .findByLoginId(
                                "unknown01"
                        )
        ).thenReturn(
                Optional.empty()
        );


        /*
         * =====================================================
         * when & then
         * =====================================================
         */
        assertThatThrownBy(
                () ->
                        localAuthService.login(
                                "unknown01",
                                "Memory123!"
                        )
        )
                /*
                 * 로그인 실패는
                 * ResponseStatusException으로 처리한다.
                 */
                .isInstanceOfSatisfying(
                        ResponseStatusException.class,

                        exception -> {

                            /*
                             * HTTP 401 Unauthorized인지 확인
                             */
                            assertThat(
                                    exception.getStatusCode()
                            ).isEqualTo(
                                    HttpStatus.UNAUTHORIZED
                            );


                            /*
                             * 보안상:
                             *
                             * "존재하지 않는 아이디"
                             *
                             * 라고 알려주지 않고
                             * 아이디/비밀번호를 하나의 실패 메시지로 처리한다.
                             */
                            assertThat(
                                    exception.getReason()
                            ).isEqualTo(
                                    "아이디 또는 비밀번호가 올바르지 않아요."
                            );
                        }
                );


        /*
         * 아이디가 존재하지 않는데
         * 비밀번호 비교까지 실행하면 안 된다.
         */
        verify(
                passwordEncoder,
                never()
        ).matches(
                anyString(),
                anyString()
        );
    }

    @Test
    @DisplayName(
            "LOCAL 아이디는 맞지만 비밀번호가 다르면 401 예외가 발생한다"
    )
    void localLogin_wrongPassword_throwsUnauthorized() {

        /*
         * =====================================================
         * given
         * =====================================================
         */

        User user =
                User.builder()
                        .id(
                                10L
                        )
                        .email(
                                "eunseo@example.com"
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


        UserLocalCredential credential =
                UserLocalCredential
                        .builder()
                        .user(
                                user
                        )
                        .loginId(
                                "eunseo01"
                        )
                        .passwordHash(
                                "encoded-password"
                        )
                        .build();


        when(
                userLocalCredentialRepository
                        .findByLoginId(
                                "eunseo01"
                        )
        ).thenReturn(
                Optional.of(
                        credential
                )
        );


        /*
         * PasswordEncoder가 false를 반환한다.
         *
         * 즉:
         *
         * 사용자가 입력한 비밀번호
         * Wrong123!
         *
         * 와
         *
         * DB에 저장된 비밀번호 Hash
         * encoded-password
         *
         * 가 서로 다르다는 뜻이다.
         */
        when(
                passwordEncoder.matches(
                        "Wrong123!",
                        "encoded-password"
                )
        ).thenReturn(
                false
        );


        /*
         * =====================================================
         * when & then
         * =====================================================
         */
        assertThatThrownBy(
                () ->
                        localAuthService.login(
                                "eunseo01",
                                "Wrong123!"
                        )
        )
                .isInstanceOfSatisfying(
                        ResponseStatusException.class,

                        exception -> {

                            assertThat(
                                    exception.getStatusCode()
                            ).isEqualTo(
                                    HttpStatus.UNAUTHORIZED
                            );

                            assertThat(
                                    exception.getReason()
                            ).isEqualTo(
                                    "아이디 또는 비밀번호가 올바르지 않아요."
                            );
                        }
                );


        /*
         * 실제 비밀번호 비교까지 실행됐는지 확인한다.
         */
        verify(
                passwordEncoder
        ).matches(
                "Wrong123!",
                "encoded-password"
        );
    }

    @Test
    @DisplayName(
            "LOCAL 로그인 비밀번호가 비어 있으면 401 예외가 발생한다"
    )
    void localLogin_blankPassword_throwsUnauthorized() {

        /*
         * 비밀번호가 공백뿐이면
         * Credential DB 조회까지 갈 필요가 없다.
         */
        assertThatThrownBy(
                () ->
                        localAuthService.login(
                                "eunseo01",
                                "   "
                        )
        )
                .isInstanceOfSatisfying(
                        ResponseStatusException.class,

                        exception -> {

                            assertThat(
                                    exception.getStatusCode()
                            ).isEqualTo(
                                    HttpStatus.UNAUTHORIZED
                            );

                            assertThat(
                                    exception.getReason()
                            ).isEqualTo(
                                    "아이디 또는 비밀번호가 올바르지 않아요."
                            );
                        }
                );


        /*
         * 잘못된 요청은 DB까지 조회하지 않는다.
         */
        verifyNoInteractions(
                userLocalCredentialRepository
        );


        /*
         * 비밀번호 Hash 비교도 하지 않는다.
         */
        verifyNoInteractions(
                passwordEncoder
        );
    }

    /*
     * =========================================================
     * 회원가입 닉네임 정책 연결 테스트
     * =========================================================
     */


    @ParameterizedTest
    @ValueSource(
            strings = {
                    "은서!",
                    "은서_",
                    "은 서"
            }
    )
    @DisplayName(
            "회원가입 닉네임에는 특수문자와 공백을 사용할 수 없다"
    )
    void signup_invalidNickname_throwsException(
            String invalidNickname
    ) {

        /*
         * when & then
         *
         * 닉네임 검증 단계에서 바로 실패해야 한다.
         */
        assertThatThrownBy(
                () ->
                        localAuthService.signup(
                                "eunseo01",
                                "Memory123!",
                                invalidNickname,
                                "eunseo@example.com",
                                "verification-token"
                        )
        )
                .isInstanceOf(
                        IllegalArgumentException.class
                )
                .hasMessage(
                        "닉네임은 한글, 영문, 숫자만 사용할 수 있어요."
                );


        /*
         * 닉네임 자체가 잘못됐으므로
         * DB나 이메일 인증까지 접근하면 안 된다.
         */
        verifyNoInteractions(
                userLocalCredentialRepository,
                userRepository,
                emailVerificationService,
                passwordEncoder
        );
    }

    @Test
    @DisplayName(
            "회원가입 닉네임은 한글 8자를 초과할 수 없다"
    )
    void signup_nineHangulNickname_throwsException() {

        /*
         * 한글 9자
         *
         * 가 나 다 라 마 바 사 아 자
         *
         * 한글 1자 = 2칸
         *
         * 9 × 2 = 18칸
         *
         * 최대 16칸을 초과한다.
         */
        String tooLongNickname =
                "가나다라마바사아자";


        assertThatThrownBy(
                () ->
                        localAuthService.signup(
                                "eunseo01",
                                "Memory123!",
                                tooLongNickname,
                                "eunseo@example.com",
                                "verification-token"
                        )
        )
                .isInstanceOf(
                        IllegalArgumentException.class
                )
                .hasMessage(
                        "닉네임은 한글 8자 또는 영문과 숫자 16자 이내로 입력해 주세요."
                );


        /*
         * 닉네임 검증에서 실패했으므로
         * DB 작업으로 넘어가지 않아야 한다.
         */
        verifyNoInteractions(
                userLocalCredentialRepository,
                userRepository,
                emailVerificationService,
                passwordEncoder
        );
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