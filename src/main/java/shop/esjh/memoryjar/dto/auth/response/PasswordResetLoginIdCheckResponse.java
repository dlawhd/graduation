package shop.esjh.memoryjar.dto.auth.response;

/*
 * PasswordResetLoginIdCheckResponse 역할
 *
 * 비밀번호 찾기 첫 단계에서
 * 입력한 LOCAL 아이디가 실제 존재하는지 알려준다.
 *
 *
 * 예:
 *
 * eunseo01 존재
 *
 * {
 *   "data": {
 *     "loginId": "eunseo01",
 *     "valid": true
 *   }
 * }
 *
 *
 * 존재하지 않음:
 *
 * {
 *   "data": {
 *     "loginId": "unknown01",
 *     "valid": false
 *   }
 * }
 */
public record PasswordResetLoginIdCheckResponse(

        /*
         * 서버에서 trim + 소문자로
         * 정규화한 실제 아이디
         */
        String loginId,

        /*
         * true
         * → 활성 LOCAL 계정 존재
         *
         * false
         * → 존재하지 않음
         */
        boolean valid
) {
}