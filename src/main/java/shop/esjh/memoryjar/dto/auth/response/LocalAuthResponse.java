package shop.esjh.memoryjar.dto.auth.response;

/*
 * LocalAuthResponse 역할
 *
 * 자체 회원가입 또는 자체 로그인 성공 후
 * 프론트에 전달할 최소 사용자 정보다.
 */
public record LocalAuthResponse(

        Long userId,

        String loginId,

        String nickname,

        String email
) {
}