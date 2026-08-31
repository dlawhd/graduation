package shop.esjh.memoryjar.dto.auth.request;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/*
 * EmailVerificationConfirmRequest 역할
 *
 * 사용자가 이메일로 받은 6자리 인증번호를
 * 서버에 보내서 실제로 맞는 번호인지 확인할 때 사용하는 DTO야.
 *
 * 요청 예:
 *
 * {
 *   "email": "eunseo@naver.com",
 *   "code": "481076"
 * }
 */
public record EmailVerificationConfirmRequest(

        /*
         * 인증번호를 발송했던 이메일
         */
        @NotBlank(message = "이메일을 입력해 주세요.")
        @Email(message = "이메일 형식을 확인해 주세요.")
        @Size(
                max = 255,
                message = "이메일은 255자 이하로 입력해 주세요."
        )
        String email,

        /*
         * 이메일로 받은 인증번호
         *
         * 숫자 6자리만 허용한다.
         */
        @NotBlank(message = "인증번호를 입력해 주세요.")
        @Pattern(
                regexp = "^\\d{6}$",
                message = "인증번호는 숫자 6자리여야 해요."
        )
        String code
) {
}