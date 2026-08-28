package shop.esjh.memoryjar.dto.auth.response;

import java.time.LocalDateTime;

/*
 * EmailVerificationSendResponse 역할
 *
 * 인증메일 발송이 성공했을 때
 * 프론트에 알려줘도 되는 정보만 전달하는 DTO야.
 *
 * 매우 중요:
 *
 * 실제 6자리 인증번호는 절대로 응답에 포함하지 않는다.
 *
 * 인증번호는 오직:
 *
 * 서버
 *   ↓
 * AWS SES
 *   ↓
 * 사용자 이메일
 *
 * 로만 전달된다.
 */
public record EmailVerificationSendResponse(

        /*
         * 서버에서 trim + 소문자 처리한 이메일
         */
        String email,

        /*
         * 현재 인증번호의 만료 시간
         *
         * 프론트에서는 이 값을 이용해
         * 남은 인증시간을 표시할 수 있다.
         */
        LocalDateTime expiresAt
) {
}