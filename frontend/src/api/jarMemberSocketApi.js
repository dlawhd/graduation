/*
 * jarMemberSocketApi.js 역할
 *
 * 공용 STOMP Client에서
 * 저금통 멤버 변화 topic만 구독한다.
 */
export function subscribeJarMemberSocket({
  subscribe,
  jarId,
  onMemberEventReceived,
  onError,
}) {
  return subscribe({
    destination:
      `/topic/jars/${jarId}/members`,

    onMessage: (message) => {
      try {
        const event = JSON.parse(message.body);
        onMemberEventReceived?.(event);
      } catch (error) {
        console.error(
          "저금통 멤버 WebSocket 메시지 파싱 실패",
          error
        );

        onError?.(error);
      }
    },

    onError,
  });
}