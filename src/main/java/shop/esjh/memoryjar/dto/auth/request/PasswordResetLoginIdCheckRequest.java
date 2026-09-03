package shop.esjh.memoryjar.dto.auth.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

/*
 * PasswordResetLoginIdCheckRequest 역할
 *
 * 비밀번호 찾기 첫 단계에서
 * 사용자가 입력한 LOCAL 로그인 아이디를 서버에 전달하는 DTO다.
 *
 * 흐름:
 *
 * 비밀번호 찾기
 *      ↓
 * 아이디 입력
 *      ↓
 * 이 DTO
 *      ↓
 * 실제 LOCAL 계정 존재 여부 확인
 *
 *
 * 중요한 점:
 *
 * 회원가입 아이디와 동일하게:
 *
 * - 4~20자
 * - 영문
 * - 숫자
 * - 밑줄(_)
 *
 * 형식만 허용한다.
 */
public record PasswordResetLoginIdCheckRequest(

        /*
         * 비밀번호를 재설정하려는
         * Memory Jar LOCAL 로그인 아이디
         */
        @NotBlank(
                message = "아이디를 입력해 주세요."
        )
        @Pattern(
                /*
                 * 공백 문자열은 @NotBlank가 담당한다.
                 *
                 * 값이 들어온 경우에는
                 * 4~20자의 영문/숫자/_만 허용한다.
                 */
                regexp =
                        "^\\s*$|^[A-Za-z0-9_]{4,20}$",

                message =
                        "아이디는 4~20자의 영문, 숫자, 밑줄(_)만 사용할 수 있어요."
        )
        String loginId
) {
}