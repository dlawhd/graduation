package shop.esjh.memoryjar.dto.auth.response;

import java.time.LocalDateTime;
import java.util.List;

/*
 * EmailVerificationConfirmResponse 역할
 *
 * 이메일 인증번호 확인에 성공했을 때
 * 회원가입 화면에 필요한 결과를 전달한다.
 *
 * 전달하는 정보:
 *
 * 1. 인증된 이메일
 * 2. 회원가입용 verificationToken
 * 3. verificationToken 만료시간
 * 4. 이미 사용 중인 이메일인지
 * 5. 기존 계정의 로그인 방법
 *
 * 중요한 보안 원칙:
 *
 * 이 응답은 사용자가 이메일로 받은
 * 실제 6자리 인증번호까지 맞춘 뒤에만 내려간다.
 *
 * 따라서 아무나 이메일 주소만 입력해서
 * "이 사람이 네이버로 가입했구나"를
 * 알아내지 못하게 한다.
 */
public record EmailVerificationConfirmResponse(

        /*
         * 서버가 정규화한 이메일
         */
        String email,

        /*
         * 신규 회원가입에서 사용할
         * 1회성 이메일 인증 완료 토큰
         */
        String verificationToken,

        /*
         * verificationToken 만료 시각
         */
        LocalDateTime verificationExpiresAt,

        /*
         * 이 이메일이 Memory Jar에서
         * 이미 사용된 적 있는지 나타낸다.
         *
         * true
         * → 신규 User를 만들면 안 됨
         *
         * false
         * → 신규 회원가입 가능
         */
        boolean existingAccount,

        /*
         * 기존 활성 계정에서 사용할 수 있는
         * 로그인 방법 목록
         *
         * 예:
         *
         * ["NAVER"]
         *
         * ["LOCAL", "GOOGLE"]
         *
         * ["NAVER", "GOOGLE", "KAKAO"]
         */
        List<String> loginMethods
) {

    /*
     * null 대신 항상 빈 배열 []이 내려가도록 한다.
     */
    public EmailVerificationConfirmResponse {

        loginMethods =
                loginMethods == null
                        ? List.of()
                        : List.copyOf(
                        loginMethods
                );
    }
}