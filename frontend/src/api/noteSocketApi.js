/*
 * noteSocketApi.js 역할
 *
 * 공용 STOMP Client에서 현재 저금통의
 * 쪽지 변경 topic만 구독한다.
 */
export function subscribeJarNoteSocket({
  subscribe,
  jarId,
  onNoteEventReceived,
  onError,
}) {
  return subscribe({
    destination:
      `/topic/jars/${jarId}/notes`,

    onMessage: (message) => {
      try {
        const event = JSON.parse(message.body);
        onNoteEventReceived?.(event);
      } catch (error) {
        console.error(
          "저금통 쪽지 WebSocket 메시지 파싱 실패",
          error
        );

        onError?.(error);
      }
    },

    onError,
  });
}