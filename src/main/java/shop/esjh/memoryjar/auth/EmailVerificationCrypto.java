package shop.esjh.memoryjar.auth;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import shop.esjh.memoryjar.enums.auth.EmailVerificationPurpose;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;

/*
 * EmailVerificationCrypto 역할
 *
 * 이메일 인증번호를 DB에 안전하게 저장하기 위해
 * HMAC-SHA256 Hash를 만들어주는 클래스야.
 *
 *
 * 사용자가 받는 실제 번호:
 *
 * 482193
 *
 * DB:
 *
 * a7b39f....
 *
 *
 * 비밀번호는 Argon2를 사용하지만
 * 이메일 인증번호는:
 *
 * - 유효시간이 매우 짧고
 * - 서버에서 비교해야 하고
 * - V30에서 CHAR(64)로 설계했기 때문에
 *
 * 별도의 서버 비밀키를 이용한 HMAC-SHA256을 사용한다.
 */
@Component
public class EmailVerificationCrypto {

    private static final String ALGORITHM =
            "HmacSHA256";

    /*
     * 이메일 인증 완료 토큰도
     * 예측하기 어려운 랜덤값으로 만들어야 한다.
     */
    private static final SecureRandom SECURE_RANDOM =
            new SecureRandom();

    /*
     * 이메일 인증 전용 비밀키
     *
     * JWT Secret과 별도로 관리한다.
     */
    private final SecretKeySpec secretKey;


    public EmailVerificationCrypto(
            @Value(
                    "${app.auth.email-verification-secret}"
            )
            String secret
    ) {

        /*
         * 너무 짧은 Secret을 실수로 사용하는 것을 막는다.
         *
         * 운영환경에서는 충분히 긴 랜덤 문자열을
         * 환경변수로 넣어줄 예정이다.
         */
        if (secret == null
                || secret.length() < 32) {

            throw new IllegalArgumentException(
                    "이메일 인증 Secret은 32자 이상이어야 합니다."
            );
        }

        this.secretKey =
                new SecretKeySpec(
                        secret.getBytes(
                                StandardCharsets.UTF_8
                        ),
                        ALGORITHM
                );
    }


    /*
     * 이메일 + 목적 + 인증번호를 하나의 값으로 묶어서
     * HMAC-SHA256 Hash를 생성한다.
     *
     * 같은 482193이어도:
     *
     * eunseo@naver.com + SIGNUP
     *
     * 과
     *
     * other@gmail.com + SIGNUP
     *
     * 의 Hash가 달라진다.
     */
    public String hashCode(
            String email,
            EmailVerificationPurpose purpose,
            String rawCode
    ) {

        try {

            Mac mac =
                    Mac.getInstance(
                            ALGORITHM
                    );

            mac.init(
                    secretKey
            );

            /*
             * Hash 입력값을 명확하게 구분한다.
             */
            String payload =
                    purpose.name()
                            + "|"
                            + email
                            + "|"
                            + rawCode;

            byte[] digest =
                    mac.doFinal(
                            payload.getBytes(
                                    StandardCharsets.UTF_8
                            )
                    );

            return toHex(
                    digest
            );

        } catch (Exception ex) {

            throw new IllegalStateException(
                    "이메일 인증번호 Hash 생성에 실패했습니다.",
                    ex
            );
        }
    }


    /*
     * 사용자가 입력한 인증번호가
     * DB에 저장된 Hash와 같은 번호인지 확인한다.
     *
     * 이번 단계에서는 아직 호출하지 않지만
     * 다음 "인증번호 확인" 단계에서 바로 사용한다.
     */
    public boolean matches(
            String email,
            EmailVerificationPurpose purpose,
            String rawCode,
            String expectedHash
    ) {

        String actualHash =
                hashCode(
                        email,
                        purpose,
                        rawCode
                );

        /*
         * 단순 String.equals() 대신
         * 일정한 비교 방식을 제공하는 isEqual()을 사용한다.
         */
        return MessageDigest.isEqual(
                actualHash.getBytes(
                        StandardCharsets.UTF_8
                ),
                expectedHash.getBytes(
                        StandardCharsets.UTF_8
                )
        );
    }

    /*
     * 이메일 인증에 성공한 뒤
     * 회원가입에서 사용할 1회성 인증 완료 토큰을 만든다.
     *
     * 32바이트 랜덤값을 URL-safe Base64 문자열로 변환한다.
     */
    public String generateVerificationToken() {

        byte[] bytes =
                new byte[32];

        SECURE_RANDOM.nextBytes(
                bytes
        );

        return Base64
                .getUrlEncoder()
                .withoutPadding()
                .encodeToString(
                        bytes
                );
    }


    /*
     * verificationToken도 DB에 원본을 저장하지 않는다.
     *
     * 이메일 + 목적 + 토큰 원본을 묶어서
     * HMAC-SHA256 Hash를 생성한다.
     */
    public String hashVerificationToken(
            String email,
            EmailVerificationPurpose purpose,
            String rawToken
    ) {

        try {

            Mac mac =
                    Mac.getInstance(
                            ALGORITHM
                    );

            mac.init(
                    secretKey
            );

            String payload =
                    "TOKEN"
                            + "|"
                            + purpose.name()
                            + "|"
                            + email
                            + "|"
                            + rawToken;

            byte[] digest =
                    mac.doFinal(
                            payload.getBytes(
                                    StandardCharsets.UTF_8
                            )
                    );

            return toHex(
                    digest
            );

        } catch (Exception ex) {

            throw new IllegalStateException(
                    "이메일 인증 토큰 Hash 생성에 실패했습니다.",
                    ex
            );
        }
    }


    /*
     * 회원가입에서 전달받은 verificationToken이
     * DB에 저장된 Hash와 같은 토큰인지 확인한다.
     */
    public boolean matchesVerificationToken(
            String email,
            EmailVerificationPurpose purpose,
            String rawToken,
            String expectedHash
    ) {

        String actualHash =
                hashVerificationToken(
                        email,
                        purpose,
                        rawToken
                );

        return MessageDigest.isEqual(
                actualHash.getBytes(
                        StandardCharsets.UTF_8
                ),
                expectedHash.getBytes(
                        StandardCharsets.UTF_8
                )
        );
    }



    /*
     * HMAC 결과 byte[]를
     * 64자리 16진수 문자열로 바꾼다.
     */
    private String toHex(
            byte[] bytes
    ) {

        StringBuilder builder =
                new StringBuilder(
                        bytes.length * 2
                );

        for (byte value : bytes) {

            builder.append(
                    String.format(
                            "%02x",
                            value
                    )
            );
        }

        return builder.toString();
    }
}