package shop.esjh.memoryjar.service;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.server.ResponseStatusException;
import shop.esjh.memoryjar.auth.EmailVerificationCrypto;
import shop.esjh.memoryjar.entity.EmailVerification;
import shop.esjh.memoryjar.enums.auth.EmailVerificationPurpose;
import shop.esjh.memoryjar.repository.EmailVerificationRepository;

import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.Locale;
import java.util.Optional;
import java.util.regex.Pattern;

/*
 * EmailVerificationService 역할
 *
 * Memory Jar 회원가입/비밀번호 재설정에서 사용할
 * 이메일 인증번호의 발급과 저장을 담당하는 서비스야.
 *
 *
 * 현재 단계에서 하는 일:
 *
 * 1. 이메일 형식 확인
 * 2. 이메일 소문자 정규화
 * 3. 안전한 6자리 인증번호 생성
 * 4. 인증번호 Hash 생성
 * 5. 5분 만료시간 설정
 * 6. DB 저장
 * 7. 60초 재전송 제한
 * 8. 재전송 시 기존 row 초기화
 *
 *
 * 아직 하지 않는 일:
 *
 * 실제 이메일 발송
 *
 * 실제 메일 전송은 다음 단계에서
 * AWS SES를 연결하면서 추가한다.
 */
@Service
public class EmailVerificationService {

    private static final ZoneId KST =
            ZoneId.of(
                    "Asia/Seoul"
            );


    /*
     * 인증번호는 000000 ~ 999999
     *
     * 총 100만 가지다.
     */
    private static final int CODE_BOUND =
            1_000_000;


    /*
     * 인증번호 유효시간
     *
     * 5분
     */
    private static final long CODE_EXPIRE_MINUTES =
            5;


    /*
     * 인증번호 재전송 대기시간
     *
     * 60초
     */
    private static final long RESEND_COOLDOWN_SECONDS =
            60;

    /*
     * 인증번호를 연속으로 틀릴 수 있는 최대 횟수
     */
    private static final int MAX_VERIFICATION_ATTEMPTS =
            5;


    /*
     * 인증번호 확인 성공 후 발급되는 verificationToken은
     * 15분 동안 회원가입에 사용할 수 있다.
     */
    private static final long VERIFICATION_TOKEN_EXPIRE_MINUTES =
            15;


    /*
     * 인증번호 형식
     */
    private static final Pattern VERIFICATION_CODE_PATTERN =
            Pattern.compile(
                    "^\\d{6}$"
            );

    /*
     * 이메일 형식을 너무 복잡하게 제한하지 않으면서
     * 일반적인 이메일 형태인지 확인한다.
     */
    private static final Pattern EMAIL_PATTERN =
            Pattern.compile(
                    "^[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}$",
                    Pattern.CASE_INSENSITIVE
            );


    /*
     * 일반 Random보다 예측이 어려운 SecureRandom을 사용한다.
     *
     * 인증번호처럼 보안과 관련된 랜덤값은
     * SecureRandom을 사용하는 것이 맞다.
     */
    private static final SecureRandom SECURE_RANDOM =
            new SecureRandom();


    private final EmailVerificationRepository
            emailVerificationRepository;

    private final EmailVerificationCrypto
            emailVerificationCrypto;


    public EmailVerificationService(
            EmailVerificationRepository emailVerificationRepository,
            EmailVerificationCrypto emailVerificationCrypto
    ) {

        this.emailVerificationRepository =
                emailVerificationRepository;

        this.emailVerificationCrypto =
                emailVerificationCrypto;
    }


    /*
     * 회원가입용 이메일 인증번호를 발급한다.
     *
     * 앞으로 Controller에서는:
     *
     * emailVerificationService.issueSignupCode(email)
     *
     * 을 호출하면 된다.
     */
    @Transactional
    public IssuedVerificationCode issueSignupCode(
            String email
    ) {

        return issueCode(
                email,
                EmailVerificationPurpose.SIGNUP
        );
    }

    /*
     * =========================================================
     * 회원가입 인증번호 확인
     * =========================================================
     *
     * 사용자가 이메일로 받은 6자리 인증번호를 검증한다.
     *
     * 성공하면 최종 회원가입에서 사용할
     * verificationToken을 새로 발급한다.
     *
     * noRollbackFor가 있는 이유:
     *
     * 인증번호가 틀렸을 때 attemptCount를 증가시킨 뒤
     * ResponseStatusException을 던져도
     * 실패 횟수는 DB에 남아야 하기 때문이다.
     */
    @Transactional(
            noRollbackFor =
                    ResponseStatusException.class
    )
    public VerifiedEmailVerification verifySignupCode(
            String email,
            String rawCode
    ) {

        String normalizedEmail =
                normalizeEmail(
                        email
                );

        validateVerificationCode(
                rawCode
        );

        LocalDateTime now =
                LocalDateTime.now(
                        KST
                );

        /*
         * 같은 인증 요청을 동시에 여러 번 확인하는 상황을 막기 위해
         * 비관적 쓰기 잠금으로 조회한다.
         */
        EmailVerification verification =
                emailVerificationRepository
                        .findByEmailAndPurposeForUpdate(
                                normalizedEmail,
                                EmailVerificationPurpose.SIGNUP
                        )
                        .orElseThrow(
                                () ->
                                        new ResponseStatusException(
                                                HttpStatus.BAD_REQUEST,
                                                "먼저 인증번호를 받아 주세요."
                                        )
                        );


        /*
         * 이미 5번 이상 틀렸다면
         * 더 이상 인증번호 확인을 허용하지 않는다.
         */
        if (
                verification.getAttemptCount()
                        >= MAX_VERIFICATION_ATTEMPTS
        ) {

            throw new ResponseStatusException(
                    HttpStatus.TOO_MANY_REQUESTS,
                    "인증번호 확인 가능 횟수를 초과했어요. 인증번호를 다시 받아 주세요."
            );
        }


        /*
         * 인증번호 자체가 이미 만료됐다면
         * 확인할 수 없다.
         */
        if (
                verification.isCodeExpired(
                        now
                )
        ) {

            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "인증번호가 만료됐어요. 인증번호를 다시 받아 주세요."
            );
        }


        /*
         * 사용자가 입력한 원본 번호를
         * DB의 HMAC Hash와 비교한다.
         */
        boolean matches =
                emailVerificationCrypto
                        .matches(
                                normalizedEmail,
                                EmailVerificationPurpose.SIGNUP,
                                rawCode,
                                verification.getCodeHash()
                        );


        if (!matches) {

            /*
             * 틀린 번호라면 실패 횟수를 증가시킨다.
             */
            verification
                    .increaseAttemptCount();

            emailVerificationRepository.save(
                    verification
            );


            /*
             * 이번 실패로 최대 횟수에 도달했다면
             * 재발송하도록 안내한다.
             */
            if (
                    verification.getAttemptCount()
                            >= MAX_VERIFICATION_ATTEMPTS
            ) {

                throw new ResponseStatusException(
                        HttpStatus.TOO_MANY_REQUESTS,
                        "인증번호 확인 가능 횟수를 초과했어요. 인증번호를 다시 받아 주세요."
                );
            }


            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "인증번호가 올바르지 않아요."
            );
        }


        /*
         * 인증번호가 정확하면
         * 최종 회원가입에서 사용할 랜덤 토큰을 만든다.
         */
        String rawVerificationToken =
                emailVerificationCrypto
                        .generateVerificationToken();


        /*
         * DB에는 토큰 원본이 아니라 Hash만 저장한다.
         */
        String verificationTokenHash =
                emailVerificationCrypto
                        .hashVerificationToken(
                                normalizedEmail,
                                EmailVerificationPurpose.SIGNUP,
                                rawVerificationToken
                        );


        LocalDateTime verificationExpiresAt =
                now.plusMinutes(
                        VERIFICATION_TOKEN_EXPIRE_MINUTES
                );


        /*
         * 인증 완료 상태를 Entity에 기록한다.
         */
        verification.markVerified(
                verificationTokenHash,
                now,
                verificationExpiresAt
        );


        emailVerificationRepository.save(
                verification
        );


        return new VerifiedEmailVerification(
                normalizedEmail,
                rawVerificationToken,
                verificationExpiresAt
        );
    }


    /*
     * =========================================================
     * 최종 회원가입에서 verificationToken 사용
     * =========================================================
     *
     * 인증번호 확인에 성공했다고 해서
     * 프론트의 verified=true만 믿으면 안 된다.
     *
     * 회원가입 요청에서 서버가 발급했던
     * verificationToken까지 다시 검증한다.
     */
    @Transactional
    public void consumeSignupVerification(
            String email,
            String rawVerificationToken
    ) {

        String normalizedEmail =
                normalizeEmail(
                        email
                );


        if (
                !StringUtils.hasText(
                        rawVerificationToken
                )
        ) {

            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "이메일 인증을 완료해 주세요."
            );
        }


        LocalDateTime now =
                LocalDateTime.now(
                        KST
                );


        EmailVerification verification =
                emailVerificationRepository
                        .findByEmailAndPurposeForUpdate(
                                normalizedEmail,
                                EmailVerificationPurpose.SIGNUP
                        )
                        .orElseThrow(
                                () ->
                                        new ResponseStatusException(
                                                HttpStatus.BAD_REQUEST,
                                                "이메일 인증 정보를 찾을 수 없어요."
                                        )
                        );


        /*
         * 인증번호 확인 자체가 끝나지 않은 상태
         */
        if (
                verification.getVerifiedAt() == null
                        || verification.getVerificationTokenHash() == null
        ) {

            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "이메일 인증을 완료해 주세요."
            );
        }


        /*
         * 이미 다른 회원가입에서 사용한 토큰
         */
        if (
                verification.isConsumed()
        ) {

            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "이미 사용된 이메일 인증이에요. 인증번호를 다시 받아 주세요."
            );
        }


        /*
         * 인증 완료 토큰의 15분 사용기간이 끝난 경우
         */
        if (
                verification.isVerificationExpired(
                        now
                )
        ) {

            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "이메일 인증 시간이 만료됐어요. 인증번호를 다시 받아 주세요."
            );
        }


        boolean matches =
                emailVerificationCrypto
                        .matchesVerificationToken(
                                normalizedEmail,
                                EmailVerificationPurpose.SIGNUP,
                                rawVerificationToken,
                                verification.getVerificationTokenHash()
                        );


        if (!matches) {

            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "이메일 인증 정보가 올바르지 않아요."
            );
        }


        /*
         * 회원가입에 실제로 사용됐으므로
         * 다시 사용할 수 없도록 소비 처리한다.
         */
        verification.consume(
                now
        );

        emailVerificationRepository.save(
                verification
        );
    }


    /*
     * 실제 공통 인증번호 발급 로직
     */
    private IssuedVerificationCode issueCode(
            String email,
            EmailVerificationPurpose purpose
    ) {

        /*
         * 사용자가 입력한 이메일을
         * DB에서 사용할 표준 형태로 정리한다.
         */
        String normalizedEmail =
                normalizeEmail(
                        email
                );


        /*
         * 현재 한국 시간
         */
        LocalDateTime now =
                LocalDateTime.now(
                        KST
                );


        /*
         * 같은 이메일 + 같은 목적의 기존 인증정보가 있는지
         * DB 쓰기 잠금을 걸고 확인한다.
         */
        Optional<EmailVerification> existingOptional =
                emailVerificationRepository
                        .findByEmailAndPurposeForUpdate(
                                normalizedEmail,
                                purpose
                        );


        /*
         * 이미 인증번호를 보낸 적이 있다면
         * 마지막 발송 후 60초가 지났는지 확인한다.
         */
        if (existingOptional.isPresent()
                && !existingOptional
                .get()
                .canResend(
                        now,
                        RESEND_COOLDOWN_SECONDS
                )) {

            throw new ResponseStatusException(
                    HttpStatus.TOO_MANY_REQUESTS,
                    "인증번호는 60초 후 다시 받을 수 있어요."
            );
        }


        /*
         * 예측하기 어려운 6자리 인증번호 생성
         *
         * 예:
         *
         * 482193
         * 000042
         */
        String rawCode =
                generateVerificationCode();


        /*
         * 실제 인증번호는 DB에 저장하지 않고
         * HMAC-SHA256 Hash로 바꾼다.
         */
        String codeHash =
                emailVerificationCrypto
                        .hashCode(
                                normalizedEmail,
                                purpose,
                                rawCode
                        );


        /*
         * 지금부터 5분 뒤가 인증번호 만료시간이다.
         */
        LocalDateTime codeExpiresAt =
                now.plusMinutes(
                        CODE_EXPIRE_MINUTES
                );


        EmailVerification verification;


        if (existingOptional.isPresent()) {

            /*
             * 이미 row가 있다면 새 row를 만들지 않는다.
             *
             * 기존 row를 새 인증번호 상태로 초기화한다.
             */
            verification =
                    existingOptional.get();

            verification.reissue(
                    codeHash,
                    codeExpiresAt,
                    now
            );

        } else {

            /*
             * 처음 인증번호를 요청한 이메일이면
             * 새로운 row를 만든다.
             */
            verification =
                    EmailVerification.issue(
                            normalizedEmail,
                            purpose,
                            codeHash,
                            codeExpiresAt,
                            now
                    );
        }


        /*
         * 신규 row는 INSERT,
         * 기존 row는 UPDATE된다.
         */
        emailVerificationRepository.save(
                verification
        );


        /*
         * rawCode를 DB에는 저장하지 않았지만
         * 다음 단계에서 AWS SES 메일 본문에는 필요하다.
         *
         * 따라서 Service 내부 결과로 반환한다.
         *
         * 중요:
         *
         * 이 rawCode를 절대로 API 응답 JSON으로
         * 사용자 브라우저에 직접 내려주면 안 된다.
         *
         * 다음 단계에서 EmailSenderService에게만 넘길 거야.
         */
        return new IssuedVerificationCode(
                normalizedEmail,
                rawCode,
                codeExpiresAt
        );
    }


    /*
     * 6자리 숫자 인증번호 생성
     *
     * SecureRandom:
     *
     * 42
     *
     * 가 나와도:
     *
     * 000042
     *
     * 형태로 6자리를 맞춘다.
     */
    private String generateVerificationCode() {

        int number =
                SECURE_RANDOM.nextInt(
                        CODE_BOUND
                );

        return String.format(
                Locale.ROOT,
                "%06d",
                number
        );
    }


    /*
     * 이메일을 DB에서 사용할 표준 형태로 정리한다.
     *
     * 예:
     *
     * "  EunSeo@Naver.com  "
     *
     *        ↓
     *
     * "eunseo@naver.com"
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


        /*
         * 최소한의 이메일 형식을 확인한다.
         */
        if (!EMAIL_PATTERN
                .matcher(
                        normalized
                )
                .matches()) {

            throw new IllegalArgumentException(
                    "이메일 형식을 확인해 주세요."
            );
        }


        return normalized;
    }

    /*
     * 인증번호가 정확히 숫자 6자리인지 확인한다.
     */
    private void validateVerificationCode(
            String rawCode
    ) {

        if (
                !StringUtils.hasText(
                        rawCode
                )
                        || !VERIFICATION_CODE_PATTERN
                        .matcher(
                                rawCode
                        )
                        .matches()
        ) {

            throw new IllegalArgumentException(
                    "인증번호는 숫자 6자리여야 해요."
            );
        }
    }

    /*
     * 인증번호를 발급한 뒤
     * 다음 단계의 메일 발송 기능에 전달할 내부 결과 객체야.
     *
     * rawCode는 절대로 API 응답으로 직접 노출하지 않는다.
     */
    public record IssuedVerificationCode(
            String email,
            String rawCode,
            LocalDateTime expiresAt
    ) {
    }

    /*
     * 인증번호 확인 성공 후
     * Controller에 전달할 내부 결과 객체
     */
    public record VerifiedEmailVerification(

            String email,

            String verificationToken,

            LocalDateTime verificationExpiresAt
    ) {
    }
}