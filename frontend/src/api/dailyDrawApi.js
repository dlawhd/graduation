// src/api/dailyDrawApi.js
import apiClient, { fetchCsrf } from "./apiClient";

/*
 * dailyDrawApi.js
 *
 * 이 파일은 "오늘의 추억 한 장(Daily Draw)" 관련 API만 모아두는 역할을 해.
 *
 * 쉽게 말하면:
 * - 오늘 카드 뽑기
 * - 오늘 카드 조회
 * - 지난 뽑기 기록 조회
 * 를 프론트에서 편하게 호출할 수 있게 해주는 파일이야.
 *
 * 왜 따로 분리하냐면?
 * - JarDetailPage.jsx 안에 API 주소를 직접 많이 쓰면 코드가 지저분해져.
 * - 나중에 주소가 바뀌어도 이 파일만 고치면 돼.
 */

/*
 * 백엔드 응답은 공통으로 이런 모양이야.
 *
 * {
 *   data: ...
 * }
 *
 * axios 응답에서는 res.data.data 로 실제 값을 꺼내야 해서
 * 이 함수를 만들어 반복을 줄여줘.
 */
function unwrapData(res) {
  return res?.data?.data;
}

/*
 * 오늘의 추억 한 장 뽑기
 *
 * POST /api/v1/jars/{jarId}/daily-draw
 *
 * 동작:
 * - 오늘 카드가 아직 없으면 새로 랜덤 1장을 뽑아.
 * - 오늘 카드가 이미 있으면 기존 오늘 카드를 그대로 받아와.
 *
 * 중요한 점:
 * - POST 요청이라 CSRF 토큰이 필요해.
 * - 그래서 요청 전에 fetchCsrf()를 먼저 호출해.
 */
export async function drawDailyDrawToday(jarId) {
  if (!jarId) {
    throw new Error("저금통 ID가 없어서 오늘의 추억 한 장을 뽑을 수 없어요.");
  }

  // POST 요청 전에 CSRF 토큰을 먼저 받아온다.
  await fetchCsrf();

  const res = await apiClient.post(`/api/v1/jars/${jarId}/daily-draw`);

  return unwrapData(res);
}

/*
 * 오늘 뽑힌 카드 조회
 *
 * GET /api/v1/jars/{jarId}/daily-draw/today
 *
 * 사용 상황:
 * - 저금통 상세 페이지에 들어왔을 때
 * - 오늘 카드가 이미 있는지 확인할 때
 *
 * 응답 예시:
 * {
 *   hasTodayDraw: true,
 *   dailyDraw: {...},
 *   message: "오늘의 추억 한 장이 공개되었어요."
 * }
 */
export async function getDailyDrawToday(jarId) {
  if (!jarId) {
    throw new Error("저금통 ID가 없어서 오늘의 추억 한 장을 조회할 수 없어요.");
  }

  const res = await apiClient.get(`/api/v1/jars/${jarId}/daily-draw/today`);

  return unwrapData(res);
}

/*
 * Daily Draw 히스토리 조회
 *
 * GET /api/v1/jars/{jarId}/daily-draw/history?page=0&size=20
 *
 * 사용 상황:
 * - 지금까지 어떤 날짜에 어떤 쪽지가 뽑혔는지 보여줄 때
 */
export async function getDailyDrawHistory(jarId, page = 0, size = 20) {
  if (!jarId) {
    throw new Error("저금통 ID가 없어서 Daily Draw 기록을 조회할 수 없어요.");
  }

  const res = await apiClient.get(`/api/v1/jars/${jarId}/daily-draw/history`, {
    params: {
      page,
      size,
    },
  });

  return unwrapData(res);
}