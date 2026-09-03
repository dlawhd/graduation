package shop.esjh.memoryjar.dto.auth.request;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/*
 * PasswordResetRequest 역할
 *
 * 이메일 인증까지 성공한 사용자가
 * 최종적으로 새 비밀번호를 저장할 때 사용하는 DTO다.
 *
 *
 * 서버로 전달하는 값:
 *
 * 1. loginId
 * 2. email
 * 3. passwordResetToken
 * 4. 새 비밀번호
 * 5. 새 비밀번호 확인
 *
 *
 * 중요한 점:
 *
 * 프론트에서 비밀번호 두 개가 일치한다고 해도
 * 서버에서 다시 확인한다.
 */
public record PasswordResetRequest(

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
         * 이메일 인증번호 확인 후
         * 서버가 발급했던 1회성 Token
         */
        @NotBlank(
                message = "이메일 인증을 완료해 주세요."
        )
        @Size(
                max = 200
        )
        String passwordResetToken,


        /*
         * 새 비밀번호
         *
         * 상세 정책은 LocalAuthService에서도
         * 다시 검사한다.
         *
         * DTO에서는 우선 너무 긴 값만 막는다.
         */
        @NotBlank(
                message = "새 비밀번호를 입력해 주세요."
        )
        @Size(
                max = 100,
                message = "비밀번호는 100자 이하로 입력해 주세요."
        )
        String newPassword,


        /*
         * 사용자가 오타 없이 같은 비밀번호를
         * 두 번 입력했는지 확인하기 위한 값
         */
        @NotBlank(
                message = "새 비밀번호를 한 번 더 입력해 주세요."
        )
        @Size(
                max = 100
        )
        String newPasswordConfirm
) {
}