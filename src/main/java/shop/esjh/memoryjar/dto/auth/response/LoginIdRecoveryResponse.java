package shop.esjh.memoryjar.dto.auth.response;

import java.util.List;

/*
 * LoginIdRecoveryResponse 역할
 *
 * 이메일 인증번호 확인까지 성공한 사용자에게
 * 아이디 찾기 결과를 전달하는 DTO다.
 *
 * 매우 중요:
 *
 * 이 DTO는 단순 이메일 입력 단계에서는
 * 절대로 반환하지 않는다.
 *
 * 이메일로 받은 6자리 인증번호까지
 * 정확하게 확인한 뒤에만 반환한다.
 */
public record LoginIdRecoveryResponse(

        /*
         * 본인 인증을 완료한 이메일
         */
        String email,

        /*
         * Memory Jar에 등록된 계정인지
         */
        boolean existingAccount,

        /*
         * LOCAL 로그인 아이디
         *
         * NAVER / GOOGLE / KAKAO만 사용하는
         * 소셜 전용 사용자는 null이다.
         */
        String loginId,

        /*
         * 사용할 수 있는 로그인 방법
         *
         * 예:
         *
         * ["LOCAL"]
         * ["LOCAL", "GOOGLE"]
         * ["NAVER"]
         */
        List<String> loginMethods
) {

    /*
     * null 대신 항상 []을 내려준다.
     */
    public LoginIdRecoveryResponse {

        loginMethods =
                loginMethods == null
                        ? List.of()
                        : List.copyOf(
                        loginMethods
                );
    }
}