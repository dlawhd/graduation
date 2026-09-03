package shop.esjh.memoryjar.service;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.server.ResponseStatusException;
import shop.esjh.memoryjar.dto.auth.response.LoginIdAvailabilityResponse;
import shop.esjh.memoryjar.entity.User;
import shop.esjh.memoryjar.entity.UserLocalCredential;
import shop.esjh.memoryjar.entity.UserOAuthAccount;
import shop.esjh.memoryjar.policy.NicknamePolicy;
import shop.esjh.memoryjar.repository.UserLocalCredentialRepository;
import shop.esjh.memoryjar.repository.UserOAuthAccountRepository;
import shop.esjh.memoryjar.repository.UserRepository;

import java.util.*;
import java.util.regex.Pattern;

/*
 * LocalAuthService 역할
 *
 * Memory Jar 자체 로그인(LOCAL)에 필요한
 * 회원가입/로그인 관련 비즈니스 로직을 담당하는 서비스야.
 *
 * 기존:
 *
 * NAVER
 * GOOGLE
 * KAKAO
 *
 * 로그인과 별개로 앞으로:
 *
 * 아이디 + 비밀번호
 *
 * 방식의 자체 계정을 담당한다.
 *
 *
 * 현재 단계에서는 첫 번째 기능인:
 *
 * "이 아이디를 사용할 수 있는가?"
 *
 * 만 구현한다.
 *
 * 이후 이 클래스에:
 *
 * 회원가입
 * LOCAL 로그인
 *
 * 기능을 차례대로 추가할 예정이다.
 */
@Service
@Transactional(readOnly = true)
public class LocalAuthService {

    /*
     * Memory Jar 아이디 규칙
     *
     * 허용:
     *
     * eunseo
     * eunseo01
     * memory_jar
     *
     * 조건:
     *
     * - 4~20자
     * - 영문 소문자
     * - 숫자
     * - 밑줄(_)
     *
     * 사용자가 대문자를 입력한 경우에는
     * 아래 normalizeLoginId()에서 먼저 소문자로 바꾼다.
     */
    private static final Pattern LOGIN_ID_PATTERN =
            Pattern.compile(
                    "^[a-z0-9_]{4,20}$"
            );

    /*
     * =========================================================
     * Memory Jar에서 지원하는 소셜 로그인 종류
     * =========================================================
     *
     * 회원가입 이메일 인증 후
     * DB에서 로그인 방법을 찾았을 때
     * 실제 Memory Jar에서 지원하는 Provider만
     * 프론트에 전달하기 위한 목록이다.
     */
    private static final Set<String>
            SUPPORTED_SOCIAL_PROVIDERS =
            Set.of(
                    "NAVER",
                    "GOOGLE",
                    "KAKAO"
            );

    /*
     * =========================================================
     * Memory Jar 회원가입 비밀번호 규칙
     * =========================================================
     *
     * 비밀번호는 아래 세 종류를
     * 각각 최소 1자 이상 포함해야 한다.
     *
     * - 영문
     * - 숫자
     * - 특수문자
     *
     * Pattern을 static final로 한 번만 만들어 두는 이유:
     *
     * 회원가입 요청이 올 때마다 정규식을
     * 새로 컴파일하지 않고 재사용할 수 있다.
     */
    private static final Pattern
            SIGNUP_PASSWORD_PATTERN =
            Pattern.compile(
                    "^(?=.*[A-Za-z])" +
                            "(?=.*[0-9])" +
                            "(?=.*[\\x21-\\x2F\\x3A-\\x40\\x5B-\\x60\\x7B-\\x7E]).+$"
            );


    private final UserLocalCredentialRepository
            userLocalCredentialRepository;

    private final UserRepository
            userRepository;

    private final EmailVerificationService
            emailVerificationService;

    private final PasswordEncoder
            passwordEncoder;

    /*
     * NAVER / GOOGLE / KAKAO처럼
     * User에게 연결된 OAuth 로그인 방법을 조회한다.
     */
    private final UserOAuthAccountRepository
            userOAuthAccountRepository;

    /*
     * 생성자 주입
     *
     * Spring이 UserLocalCredentialRepository를
     * 자동으로 넣어준다.
     */
    public LocalAuthService(
            UserLocalCredentialRepository userLocalCredentialRepository,
            UserRepository userRepository,
            EmailVerificationService emailVerificationService,
            PasswordEncoder passwordEncoder,
            UserOAuthAccountRepository userOAuthAccountRepository
    ) {

        this.userLocalCredentialRepository =
                userLocalCredentialRepository;

        this.userRepository =
                userRepository;

        this.emailVerificationService =
                emailVerificationService;

        this.passwordEncoder =
                passwordEncoder;

        this.userOAuthAccountRepository =
                userOAuthAccountRepository;
    }


    /*
     * 사용자가 입력한 아이디가
     * Memory Jar에서 사용 가능한지 확인한다.
     *
     * 처리 순서:
     *
     * 1. 빈 값인지 검사
     * 2. 앞뒤 공백 제거
     * 3. 소문자로 변환
     * 4. 아이디 형식 검사
     * 5. DB에서 중복 확인
     * 6. 결과 반환
     */
    public LoginIdAvailabilityResponse checkLoginIdAvailability(
            String loginId
    ) {

        /*
         * 사용자가 입력한 아이디를
         * 우리가 DB에 저장할 실제 형태로 정리한다.
         */
        String normalizedLoginId =
                normalizeLoginId(loginId);


        /*
         * soft delete된 LOCAL 계정까지 포함해서 검사한다.
         *
         * 0개:
         * → 한 번도 사용된 적 없는 아이디
         *
         * 1개 이상:
         * → 이미 사용된 아이디
         */
        long existingCount =
                userLocalCredentialRepository
                        .countIncludingDeletedByLoginId(
                                normalizedLoginId
                        );


        /*
         * 기존 row가 하나도 없을 때만
         * 사용 가능한 아이디다.
         */
        boolean available =
                existingCount == 0;


        return new LoginIdAvailabilityResponse(
                normalizedLoginId,
                available
        );
    }

    /*
     * =========================================================
     * 기존 계정 + 로그인 방법 조회
     * =========================================================
     *
     * 이메일 인증번호 확인까지 성공한 뒤
     * AuthController가 이 메서드를 호출한다.
     *
     * 반환 예:
     *
     * 신규 이메일
     *
     * existingAccount = false
     * loginMethods = []
     *
     *
     * 기존 NAVER 사용자
     *
     * existingAccount = true
     * loginMethods = ["NAVER"]
     *
     *
     * LOCAL + GOOGLE 사용자
     *
     * existingAccount = true
     * loginMethods = ["LOCAL", "GOOGLE"]
     */
    public ExistingAccountLoginMethods
    findExistingAccountLoginMethods(
            String email
    ) {

        /*
         * 이메일을 DB에서 사용하는 형태와
         * 동일하게 정리한다.
         *
         * 예:
         *
         * " EunSeo@Naver.com "
         *
         *     ↓
         *
         * "eunseo@naver.com"
         */
        String normalizedEmail =
                normalizeEmail(
                        email
                );

        /*
         * soft delete된 사용자까지 포함해
         * 이 이메일이 과거에라도 사용됐는지 먼저 확인한다.
         *
         * 현재 회원가입 서비스도 동일하게
         * 삭제된 User까지 포함해서 이메일 재사용을 막고 있다.
         */
        long existingCount =
                userRepository
                        .countIncludingDeletedByEmail(
                                normalizedEmail
                        );

        /*
         * 한 번도 사용되지 않은 이메일이면
         * 신규 회원가입 대상이다.
         */
        if (existingCount == 0) {

            return new ExistingAccountLoginMethods(
                    false,
                    List.of()
            );
        }

        /*
         * 현재 활성 상태인 User를 찾는다.
         *
         * User에는:
         *
         * @SQLRestriction("deleted_at IS NULL")
         *
         * 이 있으므로 일반 findByEmail()은
         * 탈퇴한 사용자를 자동으로 제외한다.
         */
        return userRepository
                .findByEmail(
                        normalizedEmail
                )
                .map(
                        this::buildExistingAccountLoginMethods
                )
                /*
                 * 이메일은 과거에 사용됐지만
                 * 현재 활성 User가 없다면
                 * 탈퇴 계정일 가능성이 있다.
                 *
                 * 신규 이메일로 잘못 판단하면
                 * 회원가입 버튼을 보여줬다가
                 * 실제 signup에서 409가 발생하므로
                 * existingAccount=true로 유지한다.
                 */
                .orElseGet(
                        () ->
                                new ExistingAccountLoginMethods(
                                        true,
                                        List.of()
                                )
                );
    }

    /*
     * =========================================================
     * 아이디 찾기
     * =========================================================
     *
     * 반드시 이메일 인증번호 확인에 성공한 뒤에만
     * Controller에서 호출해야 한다.
     *
     * 이메일 주소만 알고 있다고 해서
     * 아무나 다른 사용자의 loginId를 조회할 수 있게 하면 안 된다.
     *
     *
     * 반환 예:
     *
     * LOCAL 사용자
     *
     * existingAccount = true
     * loginId = "eunseo01"
     * loginMethods = ["LOCAL"]
     *
     *
     * LOCAL + GOOGLE 사용자
     *
     * existingAccount = true
     * loginId = "eunseo01"
     * loginMethods = ["LOCAL", "GOOGLE"]
     *
     *
     * GOOGLE 전용 사용자
     *
     * existingAccount = true
     * loginId = null
     * loginMethods = ["GOOGLE"]
     *
     *
     * 가입하지 않은 이메일
     *
     * existingAccount = false
     * loginId = null
     * loginMethods = []
     */
    public LoginIdRecoveryResult
    findLoginIdByVerifiedEmail(
            String email
    ) {

        /*
         * 기존 메서드와 똑같은 기준으로
         * 이메일을 정규화한다.
         */
        String normalizedEmail =
                normalizeEmail(
                        email
                );


        /*
         * 기존 계정 여부와
         * 사용 가능한 로그인 방법을 조회한다.
         */
        ExistingAccountLoginMethods accountInfo =
                findExistingAccountLoginMethods(
                        normalizedEmail
                );


        /*
         * Memory Jar에서 한 번도 사용되지 않은 이메일이면
         * LOCAL 아이디도 존재할 수 없다.
         */
        if (
                !accountInfo.existingAccount()
        ) {

            return new LoginIdRecoveryResult(
                    normalizedEmail,
                    false,
                    null,
                    List.of()
            );
        }


        /*
         * 활성 User를 찾는다.
         *
         * 탈퇴 계정은 @SQLRestriction 때문에
         * 여기서 조회되지 않는다.
         */
        Optional<User> userOptional =
                userRepository
                        .findByEmail(
                                normalizedEmail
                        );


        /*
         * 과거에는 사용된 이메일이지만
         * 현재 활성 계정이 없는 경우다.
         */
        if (userOptional.isEmpty()) {

            return new LoginIdRecoveryResult(
                    normalizedEmail,
                    true,
                    null,
                    accountInfo.loginMethods()
            );
        }


        User user =
                userOptional.get();


        /*
         * LOCAL 로그인 정보가 있으면
         * 실제 로그인 아이디를 가져온다.
         *
         * LOCAL 계정이 없는 소셜 전용 사용자는
         * null이 된다.
         */
        String loginId =
                userLocalCredentialRepository
                        .findByUser_Id(
                                user.getId()
                        )
                        .map(
                                UserLocalCredential::getLoginId
                        )
                        .orElse(
                                null
                        );


        return new LoginIdRecoveryResult(
                normalizedEmail,
                true,
                loginId,
                accountInfo.loginMethods()
        );
    }

    /*
     * =========================================================
     * 활성 User의 로그인 방법 만들기
     * =========================================================
     */
    private ExistingAccountLoginMethods
    buildExistingAccountLoginMethods(
            User user
    ) {

        /*
         * 최종적으로 프론트에 내려줄
         * 로그인 방법 목록이다.
         *
         * 표시 순서는:
         *
         * LOCAL
         * NAVER
         * GOOGLE
         * KAKAO
         *
         * 로 고정한다.
         */
        List<String> loginMethods =
                new ArrayList<>();


        /*
         * =====================================================
         * LOCAL 로그인 확인
         * =====================================================
         *
         * user_local_credentials에 이 User의 row가 있으면
         * 아이디 + 비밀번호 로그인도 가능한 사용자다.
         */
        boolean hasLocalLogin =
                userLocalCredentialRepository
                        .findByUser_Id(
                                user.getId()
                        )
                        .isPresent();

        if (hasLocalLogin) {
            loginMethods.add(
                    "LOCAL"
            );
        }


        /*
         * =====================================================
         * 소셜 로그인 확인
         * =====================================================
         *
         * Set을 사용하는 이유:
         *
         * 같은 NAVER가
         * users.provider와 user_oauth_accounts 양쪽에서
         * 발견되어도 한 번만 표시하기 위해서다.
         */
        Set<String> socialProviders =
                new HashSet<>();


        /*
         * 기존 users.provider 컬럼은
         * 이전 OAuth 사용자와의 호환성을 위해
         * 아직 남아 있으므로 이것도 확인한다.
         */
        addSupportedSocialProvider(
                socialProviders,
                user.getProvider()
        );


        /*
         * 현재 정식 OAuth 계정 저장소인
         * user_oauth_accounts에서도 모두 조회한다.
         */
        userOAuthAccountRepository
                .findAllByUser_Id(
                        user.getId()
                )
                .stream()
                .map(
                        UserOAuthAccount::getProvider
                )
                .forEach(
                        provider ->
                                addSupportedSocialProvider(
                                        socialProviders,
                                        provider
                                )
                );


        /*
         * HashSet의 순서는 보장되지 않으므로
         * 사용자 화면에서 항상 같은 순서로 보이도록
         * 직접 순서를 정해서 넣는다.
         */
        for (
                String provider :
                List.of(
                        "NAVER",
                        "GOOGLE",
                        "KAKAO"
                )
        ) {

            if (
                    socialProviders
                            .contains(
                                    provider
                            )
            ) {

                loginMethods.add(
                        provider
                );
            }
        }


        return new ExistingAccountLoginMethods(
                true,
                loginMethods
        );
    }


    /*
     * OAuth Provider 문자열을 정리한 뒤
     * Memory Jar에서 실제 지원하는 Provider인 경우에만
     * Set에 넣어준다.
     */
    private static void addSupportedSocialProvider(
            Set<String> providers,
            String provider
    ) {

        /*
         * null 또는 빈 문자열은 무시한다.
         */
        if (!StringUtils.hasText(provider)) {
            return;
        }

        /*
         * naver / Naver / NAVER
         *
         * 어떤 형태로 들어와도
         * NAVER처럼 대문자로 통일한다.
         */
        String normalizedProvider =
                provider
                        .trim()
                        .toUpperCase(
                                Locale.ROOT
                        );

        /*
         * 우리가 지원하는 Provider만 허용한다.
         */
        if (
                SUPPORTED_SOCIAL_PROVIDERS
                        .contains(
                                normalizedProvider
                        )
        ) {

            providers.add(
                    normalizedProvider
            );
        }
    }

    /*
     * =========================================================
     * Memory Jar 자체 로그인
     * =========================================================
     *
     * 사용자가 로그인 화면에서 입력한:
     *
     * 아이디 + 비밀번호
     *
     * 를 실제 DB 정보와 비교한다.
     *
     *
     * 처리 순서:
     *
     * 1. 아이디 앞뒤 공백 제거
     * 2. 아이디 소문자 변환
     * 3. user_local_credentials에서 아이디 조회
     * 4. 입력 비밀번호와 저장된 Hash 비교
     * 5. 성공하면 User 반환
     *
     *
     * 보안상 중요한 점:
     *
     * "아이디가 없습니다."
     * "비밀번호가 틀렸습니다."
     *
     * 를 따로 알려주지 않는다.
     *
     * 둘 다:
     *
     * "아이디 또는 비밀번호가 올바르지 않아요."
     *
     * 로 처리한다.
     *
     * 그래야 공격자가 어떤 아이디가 실제 존재하는지
     * 쉽게 알아내기 어렵다.
     */
    public LocalAuthResult login(
            String loginId,
            String password
    ) {

        /*
         * 회원가입에서 사용하는 것과 동일한 방식으로
         * 로그인 아이디도 표준 형태로 정리한다.
         *
         * EunSeo01
         *     ↓
         * eunseo01
         */
        String normalizedLoginId =
                normalizeLoginId(
                        loginId
                );


        /*
         * 비밀번호가 없는 경우
         * DB 조회를 진행할 필요가 없다.
         */
        if (!StringUtils.hasText(password)) {

            throw invalidLoginException();
        }


        /*
         * 아이디에 해당하는 LOCAL 로그인 정보를 찾는다.
         *
         * 없는 아이디여도
         * "아이디가 존재하지 않는다"고 알려주지 않는다.
         */
        UserLocalCredential credential =
                userLocalCredentialRepository
                        .findByLoginId(
                                normalizedLoginId
                        )
                        .orElseThrow(
                                this::invalidLoginException
                        );


        /*
         * 사용자가 입력한 원본 비밀번호와
         * DB에 저장된 Hash를 비교한다.
         *
         * 비밀번호를 다시 암호화해서 == 비교하는 방식이 아니다.
         *
         * PasswordEncoder가 안전하게 비교해 준다.
         */
        boolean passwordMatches =
                passwordEncoder.matches(
                        password,
                        credential.getPasswordHash()
                );


        /*
         * 비밀번호가 다르면 로그인 실패
         */
        if (!passwordMatches) {

            throw invalidLoginException();
        }


        /*
         * Credential에 연결되어 있는
         * 실제 Memory Jar User를 가져온다.
         */
        User user =
                credential.getUser();


        /*
         * Controller에서는 이 User를 가지고
         * Access Token / Refresh Token 쿠키를 발급한다.
         */
        return new LocalAuthResult(
                user,
                normalizedLoginId
        );
    }


    /*
     * 로그인 실패 응답을 한곳에서 만든다.
     *
     * 아이디 없음 / 비밀번호 틀림을
     * 똑같은 메시지로 처리하기 위한 메서드야.
     */
    private ResponseStatusException invalidLoginException() {

        return new ResponseStatusException(
                HttpStatus.UNAUTHORIZED,
                "아이디 또는 비밀번호가 올바르지 않아요."
        );
    }

    /*
     * =========================================================
     * Memory Jar 자체 회원가입
     * =========================================================
     *
     * 처리 흐름:
     *
     * 1. 아이디 정규화
     * 2. 이메일 정규화
     * 3. 아이디 중복 확인
     * 4. 이메일 중복 확인
     * 5. 이메일 verificationToken 검증
     * 6. Argon2 비밀번호 Hash
     * 7. User 생성
     * 8. UserLocalCredential 생성
     */
    @Transactional
    public LocalAuthResult signup(
            String loginId,
            String password,
            String nickname,
            String email,
            String verificationToken
    ) {

        String normalizedLoginId =
                normalizeLoginId(
                        loginId
                );

        String normalizedEmail =
                normalizeEmail(
                        email
                );

        String normalizedNickname =
                normalizeNickname(
                        nickname
                );

        validateSignupPassword(
                password
        );


        /*
         * 아이디가 이미 한 번이라도 사용된 적 있다면 막는다.
         */
        if (
                userLocalCredentialRepository
                        .countIncludingDeletedByLoginId(
                                normalizedLoginId
                        ) > 0
        ) {

            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "이미 사용 중인 아이디예요."
            );
        }


        /*
         * 같은 이메일의 기존 Memory Jar 계정이 있으면
         * 자동으로 LOCAL 계정을 합치지 않는다.
         *
         * 기존 로그인 방법을 사용하도록 안내한다.
         */
        if (
                userRepository
                        .countIncludingDeletedByEmail(
                                normalizedEmail
                        ) > 0
        ) {

            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "이미 Memory Jar에 가입된 이메일이에요. 기존 로그인 방법을 이용해 주세요."
            );
        }


        /*
         * 서버가 실제로 발급했던 verificationToken인지 확인하고
         * 이번 회원가입에서 1회 사용 처리한다.
         *
         * 아래 User/Credential 저장이 실패하면
         * 같은 트랜잭션이 rollback되므로 consume도 함께 되돌아간다.
         */
        emailVerificationService
                .consumeSignupVerification(
                        normalizedEmail,
                        verificationToken
                );


        /*
         * 비밀번호 원본은 DB에 넣지 않는다.
         */
        String passwordHash =
                passwordEncoder.encode(
                        password
                );


        try {

            /*
             * LOCAL 회원은 OAuth Provider가 없으므로
             * provider / providerId는 NULL이다.
             */
            User user =
                    User.builder()
                            .email(
                                    normalizedEmail
                            )
                            .name(
                                    normalizedNickname
                            )
                            .provider(
                                    null
                            )
                            .providerId(
                                    null
                            )
                            .build();


            user =
                    userRepository
                            .saveAndFlush(
                                    user
                            );


            UserLocalCredential credential =
                    UserLocalCredential
                            .builder()
                            .user(
                                    user
                            )
                            .loginId(
                                    normalizedLoginId
                            )
                            .passwordHash(
                                    passwordHash
                            )
                            .build();


            userLocalCredentialRepository
                    .saveAndFlush(
                            credential
                    );


            return new LocalAuthResult(
                    user,
                    normalizedLoginId
            );

        } catch (DataIntegrityViolationException ex) {

            /*
             * 동시에 두 회원가입 요청이 들어오는 경우
             * 사전 중복 검사만으로는 100% 막을 수 없다.
             *
             * 최종 안전장치인 DB UNIQUE 오류도
             * 사용자에게 500이 아니라 409로 전달한다.
             */
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "이미 사용 중인 아이디 또는 이메일이에요.",
                    ex
            );
        }
    }


    /*
     * 사용자가 입력한 아이디를
     * 서버에서 사용하는 표준 형태로 바꾼다.
     *
     * 예:
     *
     * "  EunSeo01  "
     *
     *      ↓
     *
     * "eunseo01"
     *
     *
     * 아이디 대소문자를 구분하지 않기 위해
     * 항상 소문자로 저장하고 비교한다.
     */
    private String normalizeLoginId(
            String loginId
    ) {

        /*
         * null
         * ""
         * "   "
         *
         * 같은 값은 아이디로 사용할 수 없다.
         */
        if (!StringUtils.hasText(loginId)) {
            throw new IllegalArgumentException(
                    "아이디를 입력해 주세요."
            );
        }


        /*
         * trim()
         * → 앞뒤 공백 제거
         *
         * toLowerCase(Locale.ROOT)
         * → 언어 환경의 영향을 받지 않고
         *   안전하게 소문자로 변환
         */
        String normalized =
                loginId
                        .trim()
                        .toLowerCase(Locale.ROOT);


        /*
         * 우리가 정한 아이디 규칙을 검사한다.
         */
        if (!LOGIN_ID_PATTERN
                .matcher(normalized)
                .matches()) {

            throw new IllegalArgumentException(
                    "아이디는 4~20자의 영문, 숫자, 밑줄(_)만 사용할 수 있어요."
            );
        }


        return normalized;
    }

    /*
     * 이메일도 DB에 저장하기 전에
     * 앞뒤 공백 제거 + 소문자로 통일한다.
     */
    private String normalizeEmail(
            String email
    ) {

        if (!StringUtils.hasText(email)) {

            throw new IllegalArgumentException(
                    "이메일을 입력해 주세요."
            );
        }

        String normalized =
                email
                        .trim()
                        .toLowerCase(
                                Locale.ROOT
                        );

        if (
                normalized.length() > 255
                        || !normalized.contains("@")
        ) {

            throw new IllegalArgumentException(
                    "이메일 형식을 확인해 주세요."
            );
        }

        return normalized;
    }


    /*
     * 회원가입 닉네임 검증
     *
     * 실제 규칙은 NicknamePolicy 한곳에서 관리한다.
     *
     * 그래야 회원가입과 닉네임 변경의 규칙이
     * 서로 달라지는 문제를 막을 수 있다.
     */
    private String normalizeNickname(
            String nickname
    ) {

        return NicknamePolicy
                .normalizeAndValidate(
                        nickname
                );
    }


    /*
     * =========================================================
     * 회원가입 비밀번호 검증
     * =========================================================
     *
     * Controller의 DTO 검증을 통과했더라도
     * Service 자체에서도 비밀번호 정책을 다시 확인한다.
     *
     * 이렇게 두 번 확인하는 이유:
     *
     * Controller가 아닌 다른 내부 코드에서
     * signup()을 직접 호출하더라도
     * 잘못된 비밀번호로 계정이 생성되지 않게 하기 위해서다.
     */
    private void validateSignupPassword(
            String password
    ) {

        /*
         * =====================================================
         * 1. 비밀번호 길이 검사
         * =====================================================
         *
         * null이거나
         * 8자보다 짧거나
         * 100자보다 길면 회원가입을 진행하지 않는다.
         */
        if (
                password == null
                        || password.length() < 8
                        || password.length() > 100
        ) {

            throw new IllegalArgumentException(
                    "비밀번호는 8~100자로 입력해 주세요."
            );
        }

        /*
         * =====================================================
         * 2. 문자 종류 검사
         * =====================================================
         *
         * 반드시 아래 세 종류가 모두 들어 있어야 한다.
         *
         * 영문 ✅
         * 숫자 ✅
         * 특수문자 ✅
         */
        if (
                !SIGNUP_PASSWORD_PATTERN
                        .matcher(password)
                        .matches()
        ) {

            throw new IllegalArgumentException(
                    "비밀번호는 영문, 숫자, 특수문자를 각각 1자 이상 포함해 주세요."
            );
        }
    }

    /*
     * 이메일 인증을 끝낸 사용자의
     * 기존 계정 여부와 로그인 방법을 담는 결과 객체다.
     *
     * 이 객체는 Service 내부 결과이고,
     * AuthController가 API Response DTO로 다시 변환한다.
     */
    public record ExistingAccountLoginMethods(
            boolean existingAccount,
            List<String> loginMethods
    ) {

        /*
         * 외부에서 전달된 List가 나중에 수정되지 않도록
         * 불변 List로 한 번 감싸준다.
         */
        public ExistingAccountLoginMethods {

            loginMethods =
                    loginMethods == null
                            ? List.of()
                            : List.copyOf(
                            loginMethods
                    );
        }
    }

    /*
     * Controller가 회원가입 성공 후
     * JWT 쿠키를 발급할 때 사용할 결과 객체
     */
    public record LocalAuthResult(
            User user,
            String loginId
    ) {
    }

    /*
     * 이메일 인증을 완료한 사용자의
     * 아이디 찾기 결과를 담는다.
     */
    public record LoginIdRecoveryResult(

            /*
             * 서버가 소문자로 정규화한 이메일
             */
            String email,

            /*
             * Memory Jar에 사용된 이메일인지
             */
            boolean existingAccount,

            /*
             * LOCAL 로그인 아이디
             *
             * LOCAL 계정이 없으면 null
             */
            String loginId,

            /*
             * LOCAL / NAVER / GOOGLE / KAKAO
             */
            List<String> loginMethods
    ) {

        /*
         * null List가 밖으로 나가지 않게 한다.
         */
        public LoginIdRecoveryResult {

            loginMethods =
                    loginMethods == null
                            ? List.of()
                            : List.copyOf(
                            loginMethods
                    );
        }
    }

}