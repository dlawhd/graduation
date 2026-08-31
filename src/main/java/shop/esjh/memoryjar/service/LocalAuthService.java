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
import shop.esjh.memoryjar.repository.UserLocalCredentialRepository;
import shop.esjh.memoryjar.repository.UserRepository;

import java.util.Locale;
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


    private final UserLocalCredentialRepository
            userLocalCredentialRepository;

    private final UserRepository
            userRepository;

    private final EmailVerificationService
            emailVerificationService;

    private final PasswordEncoder
            passwordEncoder;


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
            PasswordEncoder passwordEncoder
    ) {

        this.userLocalCredentialRepository =
                userLocalCredentialRepository;

        this.userRepository =
                userRepository;

        this.emailVerificationService =
                emailVerificationService;

        this.passwordEncoder =
                passwordEncoder;
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
     * 닉네임 정리
     */
    private String normalizeNickname(
            String nickname
    ) {

        if (!StringUtils.hasText(nickname)) {

            throw new IllegalArgumentException(
                    "닉네임을 입력해 주세요."
            );
        }

        String normalized =
                nickname.trim();

        if (
                normalized.length() > 50
        ) {

            throw new IllegalArgumentException(
                    "닉네임은 50자 이하로 입력해 주세요."
            );
        }

        return normalized;
    }


    /*
     * 회원가입 비밀번호 최소 규칙
     */
    private void validateSignupPassword(
            String password
    ) {

        if (
                password == null
                        || password.length() < 8
                        || password.length() > 100
        ) {

            throw new IllegalArgumentException(
                    "비밀번호는 8~100자로 입력해 주세요."
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
}