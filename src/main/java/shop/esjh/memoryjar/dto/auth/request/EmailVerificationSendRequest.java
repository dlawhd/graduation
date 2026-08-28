package shop.esjh.memoryjar.dto.auth.request;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/*
 * EmailVerificationSendRequest 역할
 *
 * 회원가입 화면에서 사용자가 입력한 이메일을
 * 서버로 전달할 때 사용하는 요청 DTO야.
 *
 * 예:
 *
 * {
 *   "email": "eunseo@naver.com"
 * }
 *
 * 서버는 이 이메일로
 * 6자리 인증번호를 발송하게 된다.
 */
public record EmailVerificationSendRequest(

        /*
         * 인증번호를 받을 이메일 주소
         *
         * @NotBlank
         * → null, "", "   " 같은 값을 막는다.
         *
         * @Email
         * → 기본적인 이메일 형식인지 확인한다.
         *
         * @Size(max = 255)
         * → V30 email_verifications.email 컬럼 길이와 맞춘다.
         */
        @NotBlank(message = "이메일을 입력해 주세요.")
        @Email(message = "이메일 형식을 확인해 주세요.")
        @Size(
                max = 255,
                message = "이메일은 255자 이하로 입력해 주세요."
        )
        String email
) {
}