package shop.esjh.memoryjar.enums.auth;

/*
 * EmailVerificationPurpose 역할
 *
 * 이메일 인증을 "어떤 목적으로 하는지" 구분한다.
 *
 * 같은 이메일이어도:
 *
 * 회원가입
 * 아이디 찾기
 * 비밀번호 재설정
 *
 * 은 서로 다른 인증 과정이다.
 *
 * email_verifications 테이블의:
 *
 * UNIQUE (email, purpose)
 *
 * 구조와 함께 사용되기 때문에
 * 서로의 인증번호가 섞이지 않는다.
 */
public enum EmailVerificationPurpose {

    /*
     * Memory Jar 자체 회원가입
     */
    SIGNUP,

    /*
     * Memory Jar 자체 로그인 아이디 찾기
     *
     * 이메일 소유권을 확인한 뒤에만
     * LOCAL loginId를 사용자에게 알려준다.
     */
    LOGIN_ID_RECOVERY,

    /*
     * 비밀번호 재설정
     *
     * 다음 단계에서 사용할 예정이다.
     */
    PASSWORD_RESET
}