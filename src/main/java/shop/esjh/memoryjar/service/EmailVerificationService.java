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
     * 아이디 찾기용 이메일 인증번호 발급
     * =========================================================
     *
     * 회원가입 인증과 저장 구조는 동일하지만
     * purpose를 LOGIN_ID_RECOVERY로 따로 저장한다.
     *
     * 이렇게 해야 회원가입 중 받은 인증번호를
     * 아이디 찾기에서 재사용할 수 없다.
     */
    @Transactional
    public IssuedVerificationCode issueLoginIdRecoveryCode(
            String email
    ) {

        return issueCode(
                email,
                EmailVerificationPurpose.LOGIN_ID_RECOVERY
        );
    }

    /*
     * =========================================================
     * 회원가입 이메일 인증번호 확인
     * =========================================================
     *
     * 실제 검증 로직은 아래 verifyCode()에 모아두고,
     * 여기서는 SIGNUP 목적만 전달한다.
     */
    @Transactional(
            noRollbackFor =
                    ResponseStatusException.class
    )
    public VerifiedEmailVerification verifySignupCode(
            String email,
            String rawCode
    ) {

        return verifyCode(
                email,
                rawCode,
                EmailVerificationPurpose.SIGNUP,
                false
        );
    }


    /*
     * =========================================================
     * 아이디 찾기 이메일 인증번호 확인
     * =========================================================
     *
     * 이메일 인증에 성공하면
     * 바로 아이디 조회에 사용하고 끝나는 인증이다.
     *
     * 회원가입처럼 다음 요청에서 verificationToken을
     * 다시 사용할 필요가 없기 때문에
     * consumeImmediately = true로 처리한다.
     */
    @Transactional(
            noRollbackFor =
                    ResponseStatusException.class
    )
    public VerifiedEmailVerification verifyLoginIdRecoveryCode(
            String email,
            String rawCode
    ) {

        return verifyCode(
                email,
                rawCode,
                EmailVerificationPurpose.LOGIN_ID_RECOVERY,
                true
        );
    }

    /*
     * =========================================================
     * 비밀번호 재설정 인증번호 발급
     * =========================================================
     *
     * 기존 회원가입/아이디 찾기 인증 구조를
     * 그대로 재사용하지만,
     *
     * purpose는 PASSWORD_RESET으로 완전히 분리한다.
     *
     * 따라서 SIGNUP 인증번호를
     * 비밀번호 재설정에 사용할 수 없다.
     */
    @Transactional
    public IssuedVerificationCode issuePasswordResetCode(
            String email
    ) {

        return issueCode(
                email,
                EmailVerificationPurpose.PASSWORD_RESET
        );
    }


    /*
     * =========================================================
     * 비밀번호 재설정 인증번호 확인
     * =========================================================
     *
     * 아이디 찾기와 다른 점:
     *
     * 아이디 찾기:
     * → 인증 성공 즉시 결과를 보여주고 끝
     *
     * 비밀번호 재설정:
     * → 인증 성공 후
     *   passwordResetToken을 다음 단계에서 한 번 더 사용
     *
     * 따라서 여기서는 인증 결과를
     * 즉시 consume하지 않는다.
     */
    @Transactional(
            noRollbackFor =
                    ResponseStatusException.class
    )
    public VerifiedEmailVerification verifyPasswordResetCode(
            String email,
            String rawCode
    ) {

        return verifyCode(
                email,
                rawCode,
                EmailVerificationPurpose.PASSWORD_RESET,

                /*
                 * false:
                 *
                 * 새 비밀번호 변경 단계까지
                 * Token을 살아 있게 둔다.
                 */
                false
        );
    }

    /*
     * =========================================================
     * 공통 이메일 인증번호 확인 로직
     * =========================================================
     *
     * SIGNUP / LOGIN_ID_RECOVERY처럼
     * 이메일 인증번호를 확인하는 공통 작업을 담당한다.
     *
     * purpose만 다르고:
     *
     * - 인증번호 형식 검사
     * - 5분 만료 검사
     * - 최대 5회 실패 제한
     * - HMAC Hash 비교
     *
     * 는 모두 동일하므로 한 곳에서 처리한다.
     */
    private VerifiedEmailVerification verifyCode(
            String email,
            String rawCode,
            EmailVerificationPurpose purpose,
            boolean consumeImmediately
    ) {

        /*
         * 이메일을:
         *
         * EunSeo@Naver.com
         *      ↓
         * eunseo@naver.com
         *
         * 형태로 통일한다.
         */
        String normalizedEmail =
                normalizeEmail(
                        email
                );


        /*
         * 인증번호가 숫자 6자리인지 확인한다.
         */
        validateVerificationCode(
                rawCode
        );


        LocalDateTime now =
                LocalDateTime.now(
                        KST
                );


        /*
         * 같은 인증을 동시에 여러 번 확인하지 못하도록
         * DB row에 쓰기 잠금을 건다.
         */
        EmailVerification verification =
                emailVerificationRepository
                        .findByEmailAndPurposeForUpdate(
                                normalizedEmail,
                                purpose
                        )
                        .orElseThrow(
                                () ->
                                        new ResponseStatusException(
                                                HttpStatus.BAD_REQUEST,
                                                "먼저 인증번호를 받아 주세요."
                                        )
                        );


        /*
         * 이미 최종 사용이 끝난 인증이라면
         * 같은 인증번호를 다시 사용할 수 없다.
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
         * 인증번호를 5번 이상 틀린 경우
         * 새 인증번호를 받아야 한다.
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
         * 5분이 지난 인증번호는 사용할 수 없다.
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
         * 사용자가 입력한 인증번호를 HMAC으로 비교한다.
         *
         * 중요한 점:
         *
         * SIGNUP이면 SIGNUP Hash,
         * LOGIN_ID_RECOVERY이면 LOGIN_ID_RECOVERY Hash
         *
         * 를 각각 사용한다.
         */
        boolean matches =
                emailVerificationCrypto
                        .matches(
                                normalizedEmail,
                                purpose,
                                rawCode,
                                verification.getCodeHash()
                        );


        if (!matches) {

            /*
             * 틀린 횟수 +1
             */
            verification
                    .increaseAttemptCount();

            emailVerificationRepository.save(
                    verification
            );


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
         * 인증번호가 맞으면
         * 인증 완료 상태를 증명할 랜덤 Token을 생성한다.
         */
        String rawVerificationToken =
                emailVerificationCrypto
                        .generateVerificationToken();


        /*
         * Token 역시 원문을 DB에 저장하지 않는다.
         */
        String verificationTokenHash =
                emailVerificationCrypto
                        .hashVerificationToken(
                                normalizedEmail,
                                purpose,
                                rawVerificationToken
                        );


        LocalDateTime verificationExpiresAt =
                now.plusMinutes(
                        VERIFICATION_TOKEN_EXPIRE_MINUTES
                );


        /*
         * 이메일 인증 성공 기록
         */
        verification.markVerified(
                verificationTokenHash,
                now,
                verificationExpiresAt
        );


        /*
         * 아이디 찾기는 인증 성공 직후
         * 같은 요청에서 결과까지 조회한다.
         *
         * 따라서 회원가입처럼 Token을
         * 다음 요청까지 보관할 이유가 없다.
         *
         * 즉시 사용 완료 처리해서 재사용을 막는다.
         */
        if (consumeImmediately) {

            verification.consume(
                    now
            );
        }


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
     * 회원가입 인증 완료 Token 사용
     * =========================================================
     */
    @Transactional
    public void consumeSignupVerification(
            String email,
            String rawVerificationToken
    ) {

        consumeVerification(
                email,
                EmailVerificationPurpose.SIGNUP,
                rawVerificationToken
        );
    }


    /*
     * =========================================================
     * 비밀번호 재설정 Token 사용
     * =========================================================
     *
     * 인증번호 확인 후 받은 passwordResetToken을
     * 실제 비밀번호 변경 시점에 1회 사용 처리한다.
     */
    @Transactional
    public void consumePasswordResetVerification(
            String email,
            String rawPasswordResetToken
    ) {

        consumeVerification(
                email,
                EmailVerificationPurpose.PASSWORD_RESET,
                rawPasswordResetToken
        );
    }


    /*
     * =========================================================
     * 이메일 인증 완료 Token 공통 소비 로직
     * =========================================================
     *
     * SIGNUP과 PASSWORD_RESET은
     * 검증 방법 자체가 동일하기 때문에
     * 하나의 메서드에서 관리한다.
     *
     * 목적(purpose)만 다르게 전달한다.
     */
    private void consumeVerification(
            String email,
            EmailVerificationPurpose purpose,
            String rawVerificationToken
    ) {

        String normalizedEmail =
                normalizeEmail(
                        email
                );


        /*
         * Token이 없다면
         * 이메일 인증을 정상적으로 완료한 요청이 아니다.
         */
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


        /*
         * 같은 Token을 동시에 두 요청이 사용하지 못하도록
         * DB row를 잠그고 확인한다.
         */
        EmailVerification verification =
                emailVerificationRepository
                        .findByEmailAndPurposeForUpdate(
                                normalizedEmail,
                                purpose
                        )
                        .orElseThrow(
                                () ->
                                        new ResponseStatusException(
                                                HttpStatus.BAD_REQUEST,
                                                "이메일 인증 정보를 찾을 수 없어요."
                                        )
                        );


        /*
         * 인증번호 확인 자체가
         * 아직 성공하지 않은 상태
         */
        if (
                verification.getVerifiedAt() ==
                        null
                        ||
                        verification.getVerificationTokenHash() ==
                                null
        ) {

            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "이메일 인증을 완료해 주세요."
            );
        }


        /*
         * 이미 회원가입 또는 이전 비밀번호 재설정에서
         * 사용한 Token은 재사용할 수 없다.
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
         * 인증 성공 후 15분이 지난 경우
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


        /*
         * 사용자가 보낸 Token 원문을
         * 서버 HMAC으로 다시 Hash해서
         * DB Hash와 비교한다.
         */
        boolean matches =
                emailVerificationCrypto
                        .matchesVerificationToken(
                                normalizedEmail,
                                purpose,
                                rawVerificationToken,
                                verification
                                        .getVerificationTokenHash()
                        );


        if (!matches) {

            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "이메일 인증 정보가 올바르지 않아요."
            );
        }


        /*
         * 실제 작업에 사용됐으므로
         * 다시 사용할 수 없도록 소비한다.
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