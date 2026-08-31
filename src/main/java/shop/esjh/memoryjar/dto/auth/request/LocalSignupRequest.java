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
         * PasswordEncoder를 거쳐 Hash 값으로 저장된다.
         *
         * Memory Jar 비밀번호 규칙:
         *
         * 1. 8~100자
         * 2. 영문 최소 1자
         * 3. 숫자 최소 1자
         * 4. 특수문자 최소 1자
         *
         * 예:
         *
         * memory123!   → 가능
         * memory_123   → 가능
         * memory1234   → 특수문자가 없어서 불가능
         * memory!!!!   → 숫자가 없어서 불가능
         * 12345678!    → 영문이 없어서 불가능
         */
        @NotBlank(
                message = "비밀번호를 입력해 주세요."
        )
        @Size(
                min = 8,
                max = 100,
                message = "비밀번호는 8~100자로 입력해 주세요."
        )
        @Pattern(
                /*
                 * (?=.*[A-Za-z])
                 * → 영문이 최소 1개 있는지 확인
                 *
                 * (?=.*[0-9])
                 * → 숫자가 최소 1개 있는지 확인
                 *
                 * (?=.*[...])
                 * → ASCII 특수문자가 최소 1개 있는지 확인
                 *
                 * 프론트 SignupPage.jsx에서 사용한
                 * 특수문자 범위와 동일하게 맞춘다.
                 */
                regexp =
                        "^(?=.*[A-Za-z])" +
                                "(?=.*[0-9])" +
                                "(?=.*[\\x21-\\x2F\\x3A-\\x40\\x5B-\\x60\\x7B-\\x7E]).+$",

                message =
                        "비밀번호는 영문, 숫자, 특수문자를 각각 1자 이상 포함해 주세요."
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