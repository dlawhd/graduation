package shop.esjh.memoryjar.enums.auth;

/*
 * EmailVerificationPurpose 역할
 *
 * 이메일 인증을 "왜 하는지" 구분하는 Enum이야.
 *
 * 같은 이메일이라도:
 *
 * 회원가입을 위한 인증
 * 비밀번호 재설정을 위한 인증
 *
 * 은 서로 다른 작업이기 때문에 목적을 구분해서 저장해.
 *
 * V30의 email_verifications.purpose 컬럼에는
 * 아래 Enum 이름이 문자열로 저장된다.
 */
public enum EmailVerificationPurpose {

    /*
     * Memory Jar 자체 회원가입을 위한 이메일 인증
     */
    SIGNUP,

    /*
     * 나중에 만들
     * "비밀번호를 잊으셨나요?"
     * 기능에서 사용할 이메일 인증
     */
    PASSWORD_RESET
}