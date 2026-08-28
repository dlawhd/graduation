package shop.esjh.memoryjar.service.mail;

import java.time.LocalDateTime;

/*
 * EmailSenderService 역할
 *
 * Memory Jar에서 이메일을 실제로 발송하는 기능의
 * "약속(인터페이스)"을 정의해.
 *
 *
 * 지금 실제 구현은:
 *
 * AWS SES
 *
 * 를 사용하지만,
 *
 * EmailVerificationService 같은 비즈니스 로직은
 * AWS SDK를 직접 알 필요가 없어.
 *
 *
 * 쉽게 말하면:
 *
 * "이 이메일 주소로 인증번호를 보내줘."
 *
 * 라는 요청만 하는 역할이야.
 */
public interface EmailSenderService {

    /*
     * 회원가입용 이메일 인증번호를 전송한다.
     *
     * toEmail
     * → 받을 사람 이메일
     *
     * verificationCode
     * → 실제 6자리 인증번호
     *
     * expiresAt
     * → 인증번호 만료 시간
     */
    void sendSignupVerificationCode(
            String toEmail,
            String verificationCode,
            LocalDateTime expiresAt
    );
}