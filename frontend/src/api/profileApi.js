import apiClient, {
  fetchCsrf,
} from "./apiClient";

/*
 * profileApi.js 역할
 *
 * 로그인한 사용자의
 * Memory Jar 프로필 수정 API를 관리한다.
 */


/*
 * 닉네임 변경
 *
 * PATCH /api/v1/me
 *
 * Request:
 *
 * {
 *   nickname: "은서"
 * }
 */
export async function updateMyNickname(
  nickname
) {

  /*
   * PATCH는 데이터를 변경하므로
   * CSRF 토큰을 먼저 준비한다.
   */
  await fetchCsrf();


  const response =
    await apiClient.patch(
      "/api/v1/me",
      {
        nickname,
      }
    );


  /*
   * 공통 응답:
   *
   * {
   *   data: {
   *     userId,
   *     email,
   *     name,
   *     birthyear
   *   }
   * }
   */
  return response?.data?.data;
}