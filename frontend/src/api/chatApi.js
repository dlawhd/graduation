// src/api/chatApi.js
import apiClient, { fetchCsrf } from "./apiClient";

/*
 * chatApi.js 역할
 *
 * 채팅 관련 백엔드 API만 모아두는 파일이야.
 *
 * 쉽게 말하면:
 * - 채팅 보내기
 * - 채팅 목록 조회
 * - Polling 새 메시지 조회
 * - 읽음 처리
 * - 안 읽은 개수 조회
 *
 * 를 여기에서 담당해.
 *
 * 이렇게 나누는 이유:
 * JarDetailPage.jsx 안에 API 코드까지 전부 넣으면
 * 나중에 코드가 너무 길어지고 복잡해져.
 */

// 서버 응답이 { data: 실제값 } 구조라서 실제값만 꺼내는 함수
function unwrapData(response) {
  return response.data?.data;
}

/*
 * 채팅 메시지 보내기
 *
 * POST /api/v1/jars/{jarId}/chat/messages
 *
 * 주의:
 * - content를 trim 하지 않는다.
 * - 사용자가 일부러 넣은 앞뒤 공백은 그대로 보낸다.
 * - 단, 화면에서는 공백만 있는 메시지는 submit 전에 막을 예정.
 */
export async function sendChatMessage(jarId, content) {
  // POST 요청은 CSRF 토큰이 필요하므로 먼저 받아온다.
  await fetchCsrf();

  const response = await apiClient.post(`/api/v1/jars/${jarId}/chat/messages`, {
    content,
  });

  return unwrapData(response);
}

/*
 * 기존 채팅 목록 조회
 *
 * GET /api/v1/jars/{jarId}/chat/messages
 *
 * 사용 상황:
 * - 채팅방 처음 열 때
 * - 위로 스크롤해서 이전 채팅 더 보기 할 때
 */
export async function getChatMessages(jarId, { beforeMessageId = null, limit = 30 } = {}) {
  const response = await apiClient.get(`/api/v1/jars/${jarId}/chat/messages`, {
    params: {
      beforeMessageId,
      limit,
    },
  });

  return unwrapData(response);
}

/*
 * Polling용 새 메시지 조회
 *
 * GET /api/v1/jars/{jarId}/chat/messages/new
 *
 * 사용 상황:
 * - 프론트가 3초마다 새 메시지 있는지 확인
 * - afterMessageId 이후 메시지만 가져옴
 */
export async function getNewChatMessages(jarId, { afterMessageId = null, limit = 30 } = {}) {
  const response = await apiClient.get(`/api/v1/jars/${jarId}/chat/messages/new`, {
    params: {
      afterMessageId,
      limit,
    },
  });

  return unwrapData(response);
}

/*
 * 채팅 읽음 처리
 *
 * POST /api/v1/jars/{jarId}/chat/read
 *
 * 사용 상황:
 * - 화면에서 마지막 메시지까지 봤을 때
 * - 서버에 "여기까지 읽었어"라고 알려줌
 */
export async function markChatAsRead(jarId, lastReadMessageId) {
  await fetchCsrf();

  const response = await apiClient.post(`/api/v1/jars/${jarId}/chat/read`, {
    lastReadMessageId,
  });

  return unwrapData(response);
}

/*
 * 안 읽은 채팅 개수 조회
 *
 * GET /api/v1/jars/{jarId}/chat/unread
 *
 * 사용 상황:
 * - 채팅 버튼 옆 뱃지
 * - 나중에 저금통 목록 카드 뱃지
 */
export async function getChatUnreadCount(jarId) {
  const response = await apiClient.get(`/api/v1/jars/${jarId}/chat/unread`);

  return unwrapData(response);
}