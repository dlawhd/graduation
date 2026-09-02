package shop.esjh.memoryjar.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/*
 * MeUpdateRequest 역할
 *
 * 로그인한 사용자가 자신의 Memory Jar 정보를
 * 수정할 때 사용하는 요청 DTO야.
 *
 * 현재는 닉네임 변경부터 지원한다.
 */
public record MeUpdateRequest(

        /*
         * Memory Jar 닉네임
         */
        @NotBlank(
                message = "닉네임을 입력해 주세요."
        )
        @Size(
                max = 16,
                message = "닉네임 길이를 확인해 주세요."
        )
        @Pattern(
                regexp = "^[가-힣A-Za-z0-9]+$",
                message = "닉네임은 한글, 영문, 숫자만 사용할 수 있어요."
        )
        String nickname
) {
}