package shop.esjh.memoryjar.dto.auth.response;

/*
 * LoginIdAvailabilityResponse 역할
 *
 * 사용자가 회원가입 화면에서 입력한 아이디를
 * 실제로 사용할 수 있는지 프론트에 알려주는 응답 DTO야.
 *
 * 예:
 *
 * 사용자가:
 *
 * EunSeo01
 *
 * 을 입력하면 서버에서:
 *
 * eunseo01
 *
 * 로 정규화한 뒤 결과를 내려준다.
 *
 * 응답 예:
 *
 * {
 *   "data": {
 *     "loginId": "eunseo01",
 *     "available": true
 *   }
 * }
 */
public record LoginIdAvailabilityResponse(

        // 서버에서 소문자로 정리한 실제 로그인 아이디
        String loginId,

        // true  = 사용 가능
        // false = 이미 사용 중
        boolean available
) {
}