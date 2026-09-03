package shop.esjh.memoryjar.dto.auth.response;

import java.time.LocalDateTime;

/*
 * PasswordResetEmailVerificationConfirmResponse 역할
 *
 * PASSWORD_RESET 이메일 인증번호 확인에 성공했을 때
 * 새 비밀번호 변경 단계에서 사용할
 * 1회용 passwordResetToken을 반환한다.
 *
 *
 * 매우 중요:
 *
 * 실제 인증번호를 다시 반환하는 것이 아니다.
 *
 * 인증번호:
 *
 * 481076
 *
 *      ↓ 확인 성공
 *
 * passwordResetToken:
 *
 * 아주 긴 랜덤 문자열
 *
 *
 * DB에는 이 Token 원문도 저장하지 않고
 * HMAC Hash만 저장한다.
 */
public record PasswordResetEmailVerificationConfirmResponse(

        /*
         * 새 비밀번호 변경 API에 전달할
         * 1회용 비밀번호 재설정 Token
         */
        String passwordResetToken,

        /*
         * Token을 사용할 수 있는 마지막 시간
         *
         * 현재 EmailVerificationService 정책상
         * 약 15분이다.
         */
        LocalDateTime expiresAt
) {
}