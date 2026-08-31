package shop.esjh.memoryjar.dto.auth.response;

import java.time.LocalDateTime;

/*
 * EmailVerificationConfirmResponse 역할
 *
 * 이메일 인증번호 확인에 성공했을 때
 * 회원가입에서 사용할 인증 완료 토큰을 프론트에 전달한다.
 */
public record EmailVerificationConfirmResponse(

        /*
         * 서버에서 정규화한 이메일
         */
        String email,

        /*
         * 회원가입에서 사용할 1회성 인증 완료 토큰
         *
         * 이 원본은 프론트가 잠깐 가지고 있다가
         * /signup 요청에서 다시 서버에 보내게 된다.
         *
         * DB에는 이 원본이 아니라 Hash만 저장된다.
         */
        String verificationToken,

        /*
         * 이 인증 완료 상태를 사용할 수 있는 마지막 시간
         */
        LocalDateTime verificationExpiresAt
) {
}