package shop.esjh.memoryjar.dto.auth.request;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/*
 * PasswordResetEmailVerificationConfirmRequest 역할
 *
 * 사용자가 이메일로 받은
 * 6자리 PASSWORD_RESET 인증번호를 확인할 때 사용한다.
 */
public record PasswordResetEmailVerificationConfirmRequest(

        @NotBlank(
                message = "아이디를 입력해 주세요."
        )
        @Pattern(
                regexp =
                        "^\\s*$|^[A-Za-z0-9_]{4,20}$",

                message =
                        "아이디는 4~20자의 영문, 숫자, 밑줄(_)만 사용할 수 있어요."
        )
        String loginId,


        @NotBlank(
                message = "이메일을 입력해 주세요."
        )
        @Email(
                message = "이메일 형식을 확인해 주세요."
        )
        @Size(
                max = 255
        )
        String email,


        /*
         * 실제 이메일로 받은 숫자 6자리
         */
        @NotBlank(
                message = "인증번호를 입력해 주세요."
        )
        @Pattern(
                regexp = "^\\d{6}$",
                message = "인증번호는 숫자 6자리여야 해요."
        )
        String code
) {
}