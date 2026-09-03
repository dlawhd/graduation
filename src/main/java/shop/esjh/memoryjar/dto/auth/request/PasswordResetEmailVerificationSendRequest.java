package shop.esjh.memoryjar.dto.auth.request;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/*
 * PasswordResetEmailVerificationSendRequest 역할
 *
 * 비밀번호 찾기 두 번째 단계에서:
 *
 * - 확인된 아이디
 * - 사용자가 직접 입력한 이메일
 *
 * 을 서버에 전달한다.
 *
 *
 * 서버에서는 반드시:
 *
 * loginId
 *      ↓
 * User
 *      ↓
 * User.email
 *
 * 이 입력한 email과 같은지 확인한다.
 *
 * 다른 사용자의 이메일이면
 * 인증번호를 보내면 안 된다.
 */
public record PasswordResetEmailVerificationSendRequest(

        /*
         * 앞 단계에서 확인한 LOCAL 로그인 아이디
         */
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


        /*
         * 해당 LOCAL 계정에 실제로 연결된 이메일
         */
        @NotBlank(
                message = "이메일을 입력해 주세요."
        )
        @Email(
                message = "이메일 형식을 확인해 주세요."
        )
        @Size(
                max = 255,
                message = "이메일은 255자 이하로 입력해 주세요."
        )
        String email
) {
}