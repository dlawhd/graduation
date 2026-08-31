package shop.esjh.memoryjar.dto.auth.request;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/*
 * LocalSignupRequest 역할
 *
 * Memory Jar 자체 아이디/비밀번호 회원가입에서
 * 최종적으로 서버에 전달하는 정보를 담는다.
 */
public record LocalSignupRequest(

        /*
         * 로그인 아이디
         *
         * 서버에서 최종적으로 trim + 소문자 변환을 한다.
         */
        @NotBlank(message = "아이디를 입력해 주세요.")
        @Size(
                min = 4,
                max = 20,
                message = "아이디는 4~20자로 입력해 주세요."
        )
        @Pattern(
                regexp = "^[A-Za-z0-9_]+$",
                message = "아이디는 영문, 숫자, 밑줄(_)만 사용할 수 있어요."
        )
        String loginId,

        /*
         * 비밀번호 원본
         *
         * DB에는 이 값이 직접 저장되지 않고
         * Argon2 Hash로 변환해서 저장한다.
         */
        @NotBlank(message = "비밀번호를 입력해 주세요.")
        @Size(
                min = 8,
                max = 100,
                message = "비밀번호는 8~100자로 입력해 주세요."
        )
        String password,

        /*
         * Memory Jar 안에서 사용할 닉네임
         */
        @NotBlank(message = "닉네임을 입력해 주세요.")
        @Size(
                max = 50,
                message = "닉네임은 50자 이하로 입력해 주세요."
        )
        String nickname,

        /*
         * 이메일 인증을 완료한 이메일
         */
        @NotBlank(message = "이메일을 입력해 주세요.")
        @Email(message = "이메일 형식을 확인해 주세요.")
        @Size(max = 255)
        String email,

        /*
         * 이메일 인증번호 확인 성공 후
         * 서버가 발급한 인증 완료 토큰
         */
        @NotBlank(message = "이메일 인증을 완료해 주세요.")
        @Size(max = 200)
        String verificationToken
) {
}