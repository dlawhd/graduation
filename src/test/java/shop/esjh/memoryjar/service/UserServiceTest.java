package shop.esjh.memoryjar.service;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import shop.esjh.memoryjar.entity.User;
import shop.esjh.memoryjar.entity.UserOAuthAccount;
import shop.esjh.memoryjar.repository.UserOAuthAccountRepository;
import shop.esjh.memoryjar.repository.UserRepository;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/*
 * 한 명의 User가
 *
 * NAVER
 * GOOGLE
 * KAKAO
 *
 * 여러 소셜 로그인 수단을 함께 사용할 수 있는지 확인한다.
 *
 * 특히 같은 이메일의 새로운 OAuth Provider가 들어왔을 때
 * User를 하나 더 만들지 않고
 * 기존 Memory Jar User에게 로그인 수단만 추가하는지 검증한다.
 */
@ExtendWith(MockitoExtension.class)
class UserServiceTest {

    // 실제 Memory Jar 회원 저장소
    @Mock
    private UserRepository userRepository;

    // NAVER / GOOGLE / KAKAO OAuth 연결 정보 저장소
    @Mock
    private UserOAuthAccountRepository userOAuthAccountRepository;

    // 위 Mock Repository들을 생성자로 주입해서 테스트한다.
    @InjectMocks
    private UserService userService;

    /*
     * 이미 OAuth 연결이 있는 사용자가 다시 로그인하면
     * 새로운 User나 OAuth 연결을 만들지 않고
     * 기존 User를 사용해야 한다.
     */
    @Test
    void findOrCreateOAuthUser_이미_연결된_OAuth계정이면_기존닉네임을_유지한다() {

        // given
        String provider =
                "GOOGLE";

        String providerId =
                "google-sub-123";

        String email =
                "new@example.com";

        String name =
                "새이름";

        /*
         * 기존 Memory Jar 사용자
         */
        User existingUser =
                User.builder()
                        .provider("NAVER")
                        .providerId("naver-111")
                        .email("old@example.com")
                        .name("옛날이름")
                        .birthyear("2000")
                        .build();

        /*
         * 이미 GOOGLE 계정이 이 User에게 연결되어 있다고 가정한다.
         */
        UserOAuthAccount existingOAuthAccount =
                UserOAuthAccount.builder()
                        .user(existingUser)
                        .provider("GOOGLE")
                        .providerId(providerId)
                        .build();

        when(
                userOAuthAccountRepository
                        .findByProviderAndProviderId(
                                provider,
                                providerId
                        )
        ).thenReturn(
                Optional.of(
                        existingOAuthAccount
                )
        );

        when(
                userRepository.save(existingUser)
        ).thenReturn(existingUser);

        // when
        User result =
                userService.findOrCreateOAuthUser(
                        provider,
                        providerId,
                        email,
                        name,
                        null
                );

        // then

        /*
         * 이미 연결된 Google 계정에서
         * 기존 User를 정확하게 반환한다.
         */
        assertThat(result)
                .isSameAs(existingUser);

        // 최신 이메일로 변경
        assertThat(
                result.getEmail()
        ).isEqualTo(
                "new@example.com"
        );

        /*
         * =========================================================
         * 닉네임은 유지되어야 한다.
         * =========================================================
         *
         * Google에서 이번 로그인 때:
         *
         * "새이름"
         *
         * 을 내려줬더라도 기존 Memory Jar User에게
         * 이미 "옛날이름"이라는 닉네임이 있다.
         *
         * 이 값은 사용자가 Memory Jar에서 직접
         * 변경했을 수도 있기 때문에 OAuth 재로그인이
         * 함부로 덮어쓰면 안 된다.
         */
        assertThat(
                result.getName()
        ).isEqualTo(
                "옛날이름"
        );

        /*
         * Google에는 birthyear가 없어서 null을 전달했으므로
         * 기존 NAVER birthyear는 유지되어야 한다.
         */
        assertThat(
                result.getBirthyear()
        ).isEqualTo(
                "2000"
        );

        /*
         * 기존 User의 첫 로그인 정보도
         * GOOGLE로 덮어쓰지 않는다.
         */
        assertThat(
                result.getProvider()
        ).isEqualTo(
                "NAVER"
        );

        assertThat(
                result.getProviderId()
        ).isEqualTo(
                "naver-111"
        );

        verify(
                userOAuthAccountRepository
        ).findByProviderAndProviderId(
                "GOOGLE",
                providerId
        );

        /*
         * 이미 OAuth 연결을 찾았으므로
         * 이메일로 User를 다시 찾을 필요가 없다.
         */
        verify(
                userRepository,
                never()
        ).findByEmail(
                anyString()
        );

        /*
         * 새로운 OAuth 연결도 만들면 안 된다.
         */
        verify(
                userOAuthAccountRepository,
                never()
        ).save(
                any(UserOAuthAccount.class)
        );

        verify(
                userRepository
        ).save(existingUser);
    }

    /*
     * Memory Jar를 처음 사용하는 사람이
     * Google로 로그인하면
     *
     * User 1개 +
     * GOOGLE OAuth 연결 1개
     *
     * 가 만들어져야 한다.
     */
    @Test
    void findOrCreateOAuthUser_신규_Google회원이면_User와_OAuth계정을_함께_만든다() {

        // given
        String provider =
                "GOOGLE";

        String providerId =
                "google-new-123";

        String email =
                "newuser@gmail.com";

        String name =
                "신규회원";

        /*
         * 해당 Google 계정 연결 없음
         */
        when(
                userOAuthAccountRepository
                        .findByProviderAndProviderId(
                                provider,
                                providerId
                        )
        ).thenReturn(
                Optional.empty()
        );

        /*
         * 동일 이메일 회원도 없음
         */
        when(
                userRepository.findByEmail(email)
        ).thenReturn(
                Optional.empty()
        );

        /*
         * save한 User 객체를 그대로 반환하도록 설정한다.
         */
        when(
                userRepository.save(
                        any(User.class)
                )
        ).thenAnswer(
                invocation ->
                        invocation.getArgument(0)
        );

        // when
        User result =
                userService.findOrCreateOAuthUser(
                        provider,
                        providerId,
                        email,
                        name,
                        null
                );

        // then

        /*
         * 실제 저장하려고 한 User를 잡아온다.
         */
        ArgumentCaptor<User> userCaptor =
                ArgumentCaptor.forClass(
                        User.class
                );

        verify(
                userRepository
        ).save(
                userCaptor.capture()
        );

        User savedUser =
                userCaptor.getValue();

        /*
         * 처음 가입한 Provider가 GOOGLE이므로
         * 기존 users 컬럼에도 첫 로그인 Provider가 들어간다.
         */
        assertThat(
                savedUser.getProvider()
        ).isEqualTo(
                "GOOGLE"
        );

        assertThat(
                savedUser.getProviderId()
        ).isEqualTo(
                "google-new-123"
        );

        assertThat(
                savedUser.getEmail()
        ).isEqualTo(
                "newuser@gmail.com"
        );

        assertThat(
                savedUser.getName()
        ).isEqualTo(
                "신규회원"
        );

        assertThat(
                savedUser.getBirthyear()
        ).isNull();

        /*
         * 새 OAuth 연결 정보도 저장됐는지 확인한다.
         */
        ArgumentCaptor<UserOAuthAccount> oauthCaptor =
                ArgumentCaptor.forClass(
                        UserOAuthAccount.class
                );

        verify(
                userOAuthAccountRepository
        ).save(
                oauthCaptor.capture()
        );

        UserOAuthAccount savedOAuthAccount =
                oauthCaptor.getValue();

        assertThat(
                savedOAuthAccount.getUser()
        ).isSameAs(
                savedUser
        );

        assertThat(
                savedOAuthAccount.getProvider()
        ).isEqualTo(
                "GOOGLE"
        );

        assertThat(
                savedOAuthAccount.getProviderId()
        ).isEqualTo(
                "google-new-123"
        );

        assertThat(result)
                .isSameAs(savedUser);
    }

    /*
     * 이번 기능에서 가장 중요한 테스트다.
     *
     * 기존 NAVER 회원이 같은 이메일의 Google로
     * 처음 로그인하면 새 User를 만들지 않고
     * 기존 User에게 GOOGLE 로그인 수단을 추가해야 한다.
     */
    @Test
    void findOrCreateOAuthUser_기존_NAVER회원이_같은이메일로_GOOGLE로그인하면_같은User에_GOOGLE을_연결한다() {

        // given
        String email =
                "user@example.com";

        /*
         * 이미 NAVER로 가입한 기존 User
         */
        User existingNaverUser =
                User.builder()
                        .provider("NAVER")
                        .providerId("naver-123")
                        .email(email)
                        .name("기존이름")
                        .birthyear("2000")
                        .build();

        /*
         * GOOGLE OAuth 연결은 아직 없다.
         */
        when(
                userOAuthAccountRepository
                        .findByProviderAndProviderId(
                                "GOOGLE",
                                "google-sub-999"
                        )
        ).thenReturn(
                Optional.empty()
        );

        /*
         * 하지만 동일 이메일의 기존 NAVER User가 있다.
         */
        when(
                userRepository.findByEmail(email)
        ).thenReturn(
                Optional.of(
                        existingNaverUser
                )
        );

        when(
                userRepository.save(
                        existingNaverUser
                )
        ).thenReturn(
                existingNaverUser
        );

        // when
        User result =
                userService.findOrCreateOAuthUser(
                        "GOOGLE",
                        "google-sub-999",
                        email,
                        "Google에서 받은 새 이름",
                        null
                );

        // then

        /*
         * 새로운 User가 아니라
         * 기존 NAVER User가 그대로 반환되어야 한다.
         */
        assertThat(result)
                .isSameAs(
                        existingNaverUser
                );

        /*
         * users.provider/providerId는
         * 첫 로그인 수단인 NAVER 그대로 유지한다.
         */
        assertThat(
                result.getProvider()
        ).isEqualTo(
                "NAVER"
        );

        assertThat(
                result.getProviderId()
        ).isEqualTo(
                "naver-123"
        );

        /*
         * =========================================================
         * 기존 Memory Jar 닉네임은 유지한다.
         * =========================================================
         *
         * NAVER로 처음 가입한 기존 User의 닉네임:
         *
         * 기존이름
         *
         * Google 로그인에서 받은 이름:
         *
         * Google에서 받은 새 이름
         *
         * 이 경우 Google 이름으로 덮어쓰지 않는다.
         */
        assertThat(
                result.getName()
        ).isEqualTo(
                "기존이름"
        );

        /*
         * Google에는 birthyear가 없으므로
         * 기존 NAVER birthyear를 유지한다.
         */
        assertThat(
                result.getBirthyear()
        ).isEqualTo(
                "2000"
        );

        /*
         * GOOGLE OAuth 계정 연결이 새로 저장됐는지 확인한다.
         */
        ArgumentCaptor<UserOAuthAccount> oauthCaptor =
                ArgumentCaptor.forClass(
                        UserOAuthAccount.class
                );

        verify(
                userOAuthAccountRepository
        ).save(
                oauthCaptor.capture()
        );

        UserOAuthAccount newGoogleAccount =
                oauthCaptor.getValue();

        assertThat(
                newGoogleAccount.getUser()
        ).isSameAs(
                existingNaverUser
        );

        assertThat(
                newGoogleAccount.getProvider()
        ).isEqualTo(
                "GOOGLE"
        );

        assertThat(
                newGoogleAccount.getProviderId()
        ).isEqualTo(
                "google-sub-999"
        );

        /*
         * User를 새로 만드는 save가 아니라
         * 기존 User 갱신 save만 한 번 실행된다.
         */
        verify(
                userRepository,
                times(1)
        ).save(
                existingNaverUser
        );
    }

    /*
     * 기존 NAVER 회원이 같은 이메일의 KAKAO로 처음 로그인하면
     * 새로운 User를 만들지 않고
     * 기존 User에 KAKAO 로그인 수단만 추가해야 한다.
     *
     * Google 로그인 추가 때 만든 다중 OAuth 구조를
     * Kakao도 그대로 재사용할 수 있는지 검증하는 핵심 테스트다.
     */
    @Test
    void findOrCreateOAuthUser_기존_NAVER회원이_같은이메일로_KAKAO로그인하면_같은User에_KAKAO를_연결한다() {

        // given
        String email =
                "user@example.com";

        /*
         * 이미 NAVER로 가입한 기존 Memory Jar User
         */
        User existingNaverUser =
                User.builder()
                        .provider("NAVER")
                        .providerId("naver-123")
                        .email(email)
                        .name("기존이름")
                        .birthyear("2000")
                        .build();

        /*
         * 이 Kakao 계정은 아직 연결된 적이 없다.
         */
        when(
                userOAuthAccountRepository
                        .findByProviderAndProviderId(
                                "KAKAO",
                                "123456789"
                        )
        ).thenReturn(
                Optional.empty()
        );

        /*
         * 하지만 같은 이메일의 기존 NAVER User는 존재한다.
         */
        when(
                userRepository.findByEmail(email)
        ).thenReturn(
                Optional.of(
                        existingNaverUser
                )
        );

        when(
                userRepository.save(
                        existingNaverUser
                )
        ).thenReturn(
                existingNaverUser
        );

        // when
        User result =
                userService.findOrCreateOAuthUser(
                        "KAKAO",
                        "123456789",
                        email,
                        "카카오에서 받은 이름",
                        null
                );

        // then

        /*
         * User를 새로 만들지 않고
         * 기존 NAVER User를 그대로 사용해야 한다.
         */
        assertThat(result)
                .isSameAs(
                        existingNaverUser
                );

        /*
         * users 테이블의 첫 로그인 Provider 정보는
         * 기존 NAVER 그대로 유지한다.
         */
        assertThat(
                result.getProvider()
        ).isEqualTo(
                "NAVER"
        );

        assertThat(
                result.getProviderId()
        ).isEqualTo(
                "naver-123"
        );

        /*
         * 기존 Memory Jar 닉네임은 유지한다.
         *
         * Kakao가 내려준 프로필 이름은
         * 이미 사용 중인 닉네임을 덮어쓰지 않는다.
         */
        assertThat(
                result.getName()
        ).isEqualTo(
                "기존이름"
        );

        /*
         * Kakao에서는 birthyear를 새로 받지 않으므로
         * 기존 NAVER 회원의 값이 유지되어야 한다.
         */
        assertThat(
                result.getBirthyear()
        ).isEqualTo(
                "2000"
        );

        /*
         * 새로 생성된 KAKAO OAuth 연결을 잡아온다.
         */
        ArgumentCaptor<UserOAuthAccount> oauthCaptor =
                ArgumentCaptor.forClass(
                        UserOAuthAccount.class
                );

        verify(
                userOAuthAccountRepository
        ).save(
                oauthCaptor.capture()
        );

        UserOAuthAccount newKakaoAccount =
                oauthCaptor.getValue();

        assertThat(
                newKakaoAccount.getUser()
        ).isSameAs(
                existingNaverUser
        );

        assertThat(
                newKakaoAccount.getProvider()
        ).isEqualTo(
                "KAKAO"
        );

        assertThat(
                newKakaoAccount.getProviderId()
        ).isEqualTo(
                "123456789"
        );

        /*
         * 기존 User를 갱신하는 save만 실행되어야 한다.
         * 새로운 별도의 User를 만들면 안 된다.
         */
        verify(
                userRepository,
                times(1)
        ).save(
                existingNaverUser
        );
    }

    /*
     * 반대 방향도 검증한다.
     *
     * Google로 먼저 가입한 사람이
     * 나중에 같은 이메일의 NAVER로 로그인해도
     * 같은 User를 사용해야 한다.
     */
    @Test
    void findOrCreateOAuthUser_기존_GOOGLE회원이_같은이메일로_NAVER로그인하면_같은User에_NAVER를_연결한다() {

        // given
        String email =
                "user@gmail.com";

        User existingGoogleUser =
                User.builder()
                        .provider("GOOGLE")
                        .providerId("google-original-123")
                        .email(email)
                        .name("Google회원")
                        .birthyear(null)
                        .build();

        /*
         * NAVER 연결은 아직 없다.
         */
        when(
                userOAuthAccountRepository
                        .findByProviderAndProviderId(
                                "NAVER",
                                "naver-new-999"
                        )
        ).thenReturn(
                Optional.empty()
        );

        /*
         * 같은 이메일의 GOOGLE User는 존재한다.
         */
        when(
                userRepository.findByEmail(email)
        ).thenReturn(
                Optional.of(
                        existingGoogleUser
                )
        );

        when(
                userRepository.save(
                        existingGoogleUser
                )
        ).thenReturn(
                existingGoogleUser
        );

        // when
        User result =
                userService.findOrCreateOAuthUser(
                        "NAVER",
                        "naver-new-999",
                        email,
                        "네이버이름",
                        "2001"
                );

        // then

        assertThat(result)
                .isSameAs(
                        existingGoogleUser
                );

        /*
         * 첫 가입 Provider는 GOOGLE 그대로 유지한다.
         */
        assertThat(
                result.getProvider()
        ).isEqualTo(
                "GOOGLE"
        );

        assertThat(
                result.getProviderId()
        ).isEqualTo(
                "google-original-123"
        );

        /*
         * =========================================================
         * 닉네임은 기존 값을 유지한다.
         * =========================================================
         *
         * 기존 Google User의 닉네임:
         * Google회원
         *
         * NAVER에서 내려준 이름:
         * 네이버이름
         *
         * OAuth 로그인은 기존 Memory Jar 닉네임을
         * 덮어쓰지 않는다.
         */
        assertThat(
                result.getName()
        ).isEqualTo(
                "Google회원"
        );


        /*
         * birthyear는 닉네임과 다르다.
         *
         * NAVER에서 새로운 출생연도를 내려줬으므로
         * 최신 프로필 정보로 갱신한다.
         */
        assertThat(
                result.getBirthyear()
        ).isEqualTo(
                "2001"
        );

        ArgumentCaptor<UserOAuthAccount> oauthCaptor =
                ArgumentCaptor.forClass(
                        UserOAuthAccount.class
                );

        verify(
                userOAuthAccountRepository
        ).save(
                oauthCaptor.capture()
        );

        UserOAuthAccount newNaverAccount =
                oauthCaptor.getValue();

        assertThat(
                newNaverAccount.getUser()
        ).isSameAs(
                existingGoogleUser
        );

        assertThat(
                newNaverAccount.getProvider()
        ).isEqualTo(
                "NAVER"
        );

        assertThat(
                newNaverAccount.getProviderId()
        ).isEqualTo(
                "naver-new-999"
        );
    }

    @Test
    void findOrCreateOAuthUser_기존닉네임이_비어있으면_OAuth이름을_최초닉네임으로_사용한다() {

        /*
         * =========================================================
         * given
         * =========================================================
         *
         * 아주 예전 데이터 등으로 인해
         * User의 nickname(name)이 없는 상황을 가정한다.
         */
        User existingUser =
                User.builder()
                        .provider(
                                "GOOGLE"
                        )
                        .providerId(
                                "google-old-123"
                        )
                        .email(
                                "old@example.com"
                        )

                        /*
                         * 아직 Memory Jar 닉네임이 없다.
                         */
                        .name(
                                null
                        )
                        .birthyear(
                                null
                        )
                        .build();


        UserOAuthAccount existingOAuthAccount =
                UserOAuthAccount.builder()
                        .user(
                                existingUser
                        )
                        .provider(
                                "GOOGLE"
                        )
                        .providerId(
                                "google-old-123"
                        )
                        .build();


        when(
                userOAuthAccountRepository
                        .findByProviderAndProviderId(
                                "GOOGLE",
                                "google-old-123"
                        )
        ).thenReturn(
                Optional.of(
                        existingOAuthAccount
                )
        );


        when(
                userRepository.save(
                        existingUser
                )
        ).thenReturn(
                existingUser
        );


        /*
         * =========================================================
         * when
         * =========================================================
         */
        User result =
                userService.findOrCreateOAuthUser(
                        "GOOGLE",
                        "google-old-123",
                        "new@example.com",
                        "Google이름",
                        null
                );


        /*
         * =========================================================
         * then
         * =========================================================
         *
         * 기존 닉네임 자체가 없었기 때문에
         * OAuth 이름을 최초 기본 닉네임으로 사용할 수 있다.
         */
        assertThat(
                result.getName()
        ).isEqualTo(
                "Google이름"
        );


        /*
         * 이메일 역시 최신 값으로 갱신된다.
         */
        assertThat(
                result.getEmail()
        ).isEqualTo(
                "new@example.com"
        );
    }

    /*
     * =========================================================
     * Memory Jar 닉네임 변경 테스트
     * =========================================================
     *
     * 로그인 방식과 관계없이
     * User 한 명의 Memory Jar 닉네임을 변경한다.
     */


    @Test
    void changeNickname_정상닉네임이면_변경하고_저장한다() {

        /*
         * =========================================================
         * given
         * =========================================================
         */
        User user =
                User.builder()
                        .id(
                                1L
                        )
                        .provider(
                                "GOOGLE"
                        )
                        .providerId(
                                "google-123"
                        )
                        .email(
                                "user@example.com"
                        )
                        .name(
                                "기존닉네임"
                        )
                        .birthyear(
                                "2000"
                        )
                        .build();


        /*
         * userId = 1 사용자가 존재한다고 가정한다.
         */
        when(
                userRepository.findById(
                        1L
                )
        ).thenReturn(
                Optional.of(
                        user
                )
        );


        /*
         * 저장하면 같은 User를 반환하도록 한다.
         */
        when(
                userRepository.save(
                        user
                )
        ).thenReturn(
                user
        );


        /*
         * =========================================================
         * when
         * =========================================================
         */
        User result =
                userService.changeNickname(
                        1L,
                        "새닉네임"
                );


        /*
         * =========================================================
         * then
         * =========================================================
         */

        /*
         * 실제 User의 nickname이 바뀌어야 한다.
         */
        assertThat(
                result.getName()
        ).isEqualTo(
                "새닉네임"
        );


        /*
         * 정확한 사용자 번호로 조회했는지 확인한다.
         */
        verify(
                userRepository
        ).findById(
                1L
        );


        /*
         * 변경한 User를 DB에 저장했는지 확인한다.
         */
        verify(
                userRepository
        ).save(
                user
        );


        /*
         * 닉네임 변경은 OAuth 계정을 추가하거나
         * 수정하는 작업이 아니다.
         */
        verifyNoInteractions(
                userOAuthAccountRepository
        );
    }

    @Test
    void changeNickname_LOCAL사용자도_닉네임을_변경할수있다() {

        /*
         * LOCAL 가입자는 OAuth Provider가 없다.
         */
        User localUser =
                User.builder()
                        .id(
                                2L
                        )
                        .provider(
                                null
                        )
                        .providerId(
                                null
                        )
                        .email(
                                "local@example.com"
                        )
                        .name(
                                "기존LOCAL"
                        )
                        .build();


        when(
                userRepository.findById(
                        2L
                )
        ).thenReturn(
                Optional.of(
                        localUser
                )
        );


        when(
                userRepository.save(
                        localUser
                )
        ).thenReturn(
                localUser
        );


        /*
         * LOCAL 사용자도 동일한 API/Service를 이용한다.
         */
        User result =
                userService.changeNickname(
                        2L,
                        "로컬사용자"
                );


        assertThat(
                result.getName()
        ).isEqualTo(
                "로컬사용자"
        );


        verify(
                userRepository
        ).save(
                localUser
        );
    }

    @Test
    void changeNickname_특수문자가_포함되면_예외가_발생한다() {

        /*
         * =========================================================
         * when & then
         * =========================================================
         *
         * ! 는 허용하지 않는 특수문자다.
         */
        assertThatThrownBy(
                () ->
                        userService.changeNickname(
                                1L,
                                "은서!"
                        )
        )
                .isInstanceOf(
                        IllegalArgumentException.class
                )
                .hasMessage(
                        "닉네임은 한글, 영문, 숫자만 사용할 수 있어요."
                );


        /*
         * NicknamePolicy에서 먼저 차단되므로
         * DB 조회조차 하지 않는 것이 정상이다.
         */
        verifyNoInteractions(
                userRepository
        );

        verifyNoInteractions(
                userOAuthAccountRepository
        );
    }

    @Test
    void changeNickname_한글9자는_길이초과로_예외가_발생한다() {

        /*
         * 한글 9자
         *
         * 한글 1자 = 2칸
         *
         * 9 × 2 = 18
         *
         * 최대 16칸을 넘는다.
         */
        String tooLongNickname =
                "가나다라마바사아자";


        assertThatThrownBy(
                () ->
                        userService.changeNickname(
                                1L,
                                tooLongNickname
                        )
        )
                .isInstanceOf(
                        IllegalArgumentException.class
                )
                .hasMessage(
                        "닉네임은 한글 8자 또는 영문과 숫자 16자 이내로 입력해 주세요."
                );


        /*
         * 잘못된 닉네임이므로
         * 사용자 DB를 조회할 필요도 없다.
         */
        verifyNoInteractions(
                userRepository
        );
    }

    @Test
    void changeNickname_존재하지않는_사용자면_404예외가_발생한다() {

        /*
         * userId = 999는 존재하지 않는다고 가정한다.
         */
        when(
                userRepository.findById(
                        999L
                )
        ).thenReturn(
                Optional.empty()
        );


        assertThatThrownBy(
                () ->
                        userService.changeNickname(
                                999L,
                                "새닉네임"
                        )
        )
                .isInstanceOfSatisfying(
                        ResponseStatusException.class,

                        exception -> {

                            /*
                             * 사용자 없음 = 404
                             */
                            assertThat(
                                    exception.getStatusCode()
                            ).isEqualTo(
                                    HttpStatus.NOT_FOUND
                            );


                            assertThat(
                                    exception.getReason()
                            ).isEqualTo(
                                    "사용자 정보를 찾을 수 없어요."
                            );
                        }
                );


        /*
         * 사용자를 못 찾았으므로
         * save는 절대 실행되면 안 된다.
         */
        verify(
                userRepository,
                never()
        ).save(
                any(User.class)
        );
    }

    /*
     * =========================================================
     * 내 정보 조회용 User 조회 테스트
     * =========================================================
     */


    @Test
    void getUser_존재하는_사용자면_User를_반환한다() {

        User user =
                User.builder()
                        .id(
                                1L
                        )
                        .email(
                                "user@example.com"
                        )
                        .name(
                                "은서"
                        )
                        .build();


        when(
                userRepository.findById(
                        1L
                )
        ).thenReturn(
                Optional.of(
                        user
                )
        );


        User result =
                userService.getUser(
                        1L
                );


        assertThat(
                result
        ).isSameAs(
                user
        );
    }

    @Test
    void getUser_존재하지않는_사용자면_404예외가_발생한다() {

        when(
                userRepository.findById(
                        999L
                )
        ).thenReturn(
                Optional.empty()
        );


        assertThatThrownBy(
                () ->
                        userService.getUser(
                                999L
                        )
        )
                .isInstanceOfSatisfying(
                        ResponseStatusException.class,

                        exception -> {

                            assertThat(
                                    exception.getStatusCode()
                            ).isEqualTo(
                                    HttpStatus.NOT_FOUND
                            );

                            assertThat(
                                    exception.getReason()
                            ).isEqualTo(
                                    "사용자 정보를 찾을 수 없어요."
                            );
                        }
                );
    }

    /*
     * Provider가 소문자 kakao로 들어와도
     * DB에서는 KAKAO로 통일되어야 한다.
     *
     * 실제 OAuth registrationId는 "kakao"처럼 소문자로 들어올 수 있으므로
     * UserService에서 안전하게 대문자로 정규화하는지 확인한다.
     */
    @Test
    void findOrCreateOAuthUser_kakao가_소문자여도_KAKAO로_정규화한다() {

        // given
        when(
                userOAuthAccountRepository
                        .findByProviderAndProviderId(
                                "KAKAO",
                                "kakao-123"
                        )
        ).thenReturn(
                Optional.empty()
        );

        when(
                userRepository.findByEmail(
                        "user@kakao.com"
                )
        ).thenReturn(
                Optional.empty()
        );

        /*
         * 새 User 저장 시 전달받은 객체를 그대로 반환한다.
         */
        when(
                userRepository.save(
                        any(User.class)
                )
        ).thenAnswer(
                invocation ->
                        invocation.getArgument(0)
        );

        // when
        User result =
                userService.findOrCreateOAuthUser(
                        "kakao",
                        "kakao-123",
                        "user@kakao.com",
                        "카카오회원",
                        null
                );

        // then

        /*
         * Repository 조회부터 이미
         * KAKAO 대문자로 정규화되어야 한다.
         */
        verify(
                userOAuthAccountRepository
        ).findByProviderAndProviderId(
                "KAKAO",
                "kakao-123"
        );

        /*
         * 신규 User의 첫 로그인 Provider도
         * KAKAO로 저장되는지 확인한다.
         */
        assertThat(
                result.getProvider()
        ).isEqualTo(
                "KAKAO"
        );

        assertThat(
                result.getProviderId()
        ).isEqualTo(
                "kakao-123"
        );

        /*
         * user_oauth_accounts에도
         * KAKAO가 저장되는지 확인한다.
         */
        ArgumentCaptor<UserOAuthAccount> captor =
                ArgumentCaptor.forClass(
                        UserOAuthAccount.class
                );

        verify(
                userOAuthAccountRepository
        ).save(
                captor.capture()
        );

        assertThat(
                captor.getValue().getProvider()
        ).isEqualTo(
                "KAKAO"
        );

        assertThat(
                captor.getValue().getProviderId()
        ).isEqualTo(
                "kakao-123"
        );
    }

    /*
     * Memory Jar에서 지원하지 않는 OAuth Provider는
     * DB를 조회하기 전에 바로 차단해야 한다.
     *
     * KAKAO는 이제 공식 지원 Provider이므로
     * 지원하지 않는 예시로 FACEBOOK을 사용한다.
     */
    @Test
    void findOrCreateOAuthUser_지원하지않는_provider면_예외를_던진다() {

        // when & then
        assertThatThrownBy(() ->
                userService.findOrCreateOAuthUser(
                        "FACEBOOK",
                        "facebook-123",
                        "user@example.com",
                        "은서",
                        null
                )
        )
                .isInstanceOf(
                        IllegalArgumentException.class
                )
                .hasMessage(
                        "지원하지 않는 소셜 로그인 Provider입니다: FACEBOOK"
                );

        /*
         * Provider 검증 단계에서 바로 실패하므로
         * DB Repository에는 접근하지 않는다.
         */
        verifyNoInteractions(
                userRepository
        );

        verifyNoInteractions(
                userOAuthAccountRepository
        );
    }

    /*
     * OAuth 사용자 고유 ID가 없으면
     * 정상적인 계정 연결을 할 수 없으므로 막는다.
     */
    @Test
    void findOrCreateOAuthUser_providerId가_없으면_예외를_던진다() {

        // when & then
        assertThatThrownBy(() ->
                userService.findOrCreateOAuthUser(
                        "GOOGLE",
                        null,
                        "user@gmail.com",
                        "은서",
                        null
                )
        )
                .isInstanceOf(
                        IllegalArgumentException.class
                )
                .hasMessage(
                        "소셜 로그인 사용자 ID가 비어 있습니다."
                );

        verifyNoInteractions(
                userRepository
        );

        verifyNoInteractions(
                userOAuthAccountRepository
        );
    }

    /*
     * 현재 계정 자동 연결 기준으로 이메일을 사용하므로
     * 이메일을 받지 못하면 로그인 연결을 중단한다.
     */
    @Test
    void findOrCreateOAuthUser_email이_없으면_예외를_던진다() {

        // when & then
        assertThatThrownBy(() ->
                userService.findOrCreateOAuthUser(
                        "GOOGLE",
                        "google-123",
                        null,
                        "은서",
                        null
                )
        )
                .isInstanceOf(
                        IllegalArgumentException.class
                )
                .hasMessage(
                        "소셜 로그인 이메일이 비어 있습니다."
                );

        /*
         * providerId/email 기본 검증이 끝나기 전에는
         * Repository를 사용하면 안 된다.
         */
        verifyNoInteractions(
                userRepository
        );

        verifyNoInteractions(
                userOAuthAccountRepository
        );
    }
}