// src/api/notificationApi.js

// 이 파일은 "알림(notification) 관련 API 요청"만 모아두는 곳
// 쉽게 말하면:
// - 화면 컴포넌트는 "보여주기 / 클릭 처리"
// - 이 파일은 "서버에 부탁하기"
// 역할을 나눠서 정리하는 파일
// ------------------------------------------------------------

import apiClient, { fetchCsrf } from "./apiClient";

/*
 * 서버 응답이 { data: ... } 구조라서
 * 우리가 진짜로 쓰는 값만 꺼내주는 작은 도우미 함수
 */
function extractData(response) {
  return response?.data?.data;
}

/*
 * 내 알림 목록 조회
 * 기본값은 page=0, size=10 으로 잡아둘게.
 * 헤더 드롭다운에서 처음 보여주기 딱 좋은 크기야.
 */
export async function getNotifications(page = 0, size = 10) {
  const response = await apiClient.get("/api/v1/notifications", {
    params: { page, size },
  });

  return extractData(response);
}

/*
 * 안 읽은 알림 개수 조회
 * 헤더 종 아이콘 옆 빨간 숫자 뱃지에 사용해.
 */
export async function getUnreadCount() {
  const response = await apiClient.get("/api/v1/notifications/unread-count");
  return extractData(response);
}

/*
 * 알림 1개 읽음 처리
 * POST 요청이니까 CSRF 토큰을 먼저 받아와야 해.
 */
export async function readNotification(notificationId) {
  await fetchCsrf();

  const response = await apiClient.post(
    `/api/v1/notifications/${notificationId}/read`
  );

  return extractData(response);
}

/*
 * 내 안 읽은 알림 전체 읽음 처리
 * "모두 읽음" 버튼에 연결할 함수야.
 */
export async function readAllNotifications() {
  await fetchCsrf();

  const response = await apiClient.post("/api/v1/notifications/read-all");
  return extractData(response);
}

/*
 * 한 곳에서 가져다 쓰기 쉽게 묶어서도 export
 */
const notificationApi = {
  getNotifications,
  getUnreadCount,
  readNotification,
  readAllNotifications,
};

export default notificationApi;