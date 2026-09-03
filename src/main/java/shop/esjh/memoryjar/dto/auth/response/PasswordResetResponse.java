package shop.esjh.memoryjar.dto.auth.response;

/*
 * PasswordResetResponse 역할
 *
 * 비밀번호 재설정이 최종적으로 성공했음을
 * 프론트에 알려주는 DTO다.
 */
public record PasswordResetResponse(

        /*
         * true이면 비밀번호 변경 완료
         */
        boolean ok
) {
}