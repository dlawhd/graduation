/*
 * jarOpenSocketApi.js 역할
 *
 * 공용 STOMP Client에서
 * 저금통 오픈 topic만 구독한다.
 */
export function subscribeJarOpenSocket({
  subscribe,
  jarId,
  onJarOpened,
  onError,
}) {
  return subscribe({
    destination:
      `/topic/jars/${jarId}/open`,

    onMessage: (message) => {
      try {
        const event = JSON.parse(message.body);

        if (event?.eventType === "JAR_OPENED") {
          onJarOpened?.(event);
        }
      } catch (error) {
        console.error(
          "저금통 오픈 WebSocket 메시지 파싱 실패",
          error
        );

        onError?.(error);
      }
    },

    onError,
  });
}