package shop.esjh.memoryjar.dto.auth.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

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
         * Service에서:
         *
         * EunSeo01
         *      ↓
         * eunseo01
         *
         * 처럼 소문자로 정리한 뒤 실제 DB에서 찾는다.
         */
        @NotBlank(
                message = "아이디를 입력해 주세요."
        )
        @Size(
                min = 4,
                max = 20,
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