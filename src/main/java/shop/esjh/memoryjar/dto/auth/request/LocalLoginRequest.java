package shop.esjh.memoryjar.dto.auth.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import jakarta.validation.constraints.Pattern;

/*
 * LocalLoginRequest 역할
 *
 * Memory Jar 자체 로그인 화면에서 입력한
 *
 * - 아이디
 * - 비밀번호
 *
 * 를 백엔드로 전달하는 DTO야.
 *
 * 소셜 로그인이 아니라
 * 우리가 만든 아이디 + 비밀번호 로그인에서 사용한다.
 */
public record LocalLoginRequest(

        /*
         * Memory Jar 로그인 아이디
         *
         * 검증 순서의 의미:
         *
         * 1. 아무것도 입력하지 않았다면
         *    → "아이디를 입력해 주세요."
         *
         * 2. 값은 있지만 4~20자가 아니라면
         *    → "아이디는 4~20자로 입력해 주세요."
         *
         * @Pattern에서 ^\\s*$를 허용한 이유는
         * 빈 문자열/공백 문자열의 오류를 @NotBlank가
         * 전담하도록 하기 위해서다.
         */
        @NotBlank(
                message = "아이디를 입력해 주세요."
        )
        @Size(
                max = 20,
                message = "아이디는 4~20자로 입력해 주세요."
        )
        @Pattern(
                regexp = "^\\s*$|^.{4,20}$",
                message = "아이디는 4~20자로 입력해 주세요."
        )
        String loginId,

        /*
         * 비밀번호 원본
         *
         * 이 값은 DB에 저장하지 않는다.
         *
         * DB에 저장된 Argon2 Hash와
         * PasswordEncoder.matches()로 비교만 한다.
         */
        @NotBlank(
                message = "비밀번호를 입력해 주세요."
        )
        @Size(
                max = 100,
                message = "비밀번호는 100자 이하로 입력해 주세요."
        )
        String password
) {
}