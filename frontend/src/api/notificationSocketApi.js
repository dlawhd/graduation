/*
 * notificationSocketApi.js 역할
 *
 * 공용 STOMP Client에서 내 알림 topic만 구독하는 함수다.
 */
export function subscribeNotificationSocket({
  subscribe,
  userId,
  onNotificationReceived,
  onError,
}) {
  return subscribe({
    destination:
      `/topic/users/${userId}/notifications`,

    onMessage: (message) => {
      try {
        const notification = JSON.parse(
          message.body
        );

        onNotificationReceived?.(notification);
      } catch (error) {
        console.error(
          "알림 WebSocket 메시지 파싱 실패",
          error
        );

        onError?.(error);
      }
    },

    onError,
  });
}