/*
 * dailyDrawSocketApi.js 역할
 *
 * 공용 STOMP Client에서
 * Daily Draw topic만 구독한다.
 */
export function subscribeDailyDrawSocket({
  subscribe,
  jarId,
  onDailyDrawRevealed,
  onError,
}) {
  return subscribe({
    destination:
      `/topic/jars/${jarId}/daily-draw`,

    onMessage: (message) => {
      try {
        const event = JSON.parse(message.body);

        if (
          event?.eventType ===
          "DAILY_DRAW_REVEALED"
        ) {
          onDailyDrawRevealed?.(event);
        }
      } catch (error) {
        console.error(
          "Daily Draw WebSocket 메시지 파싱 실패",
          error
        );

        onError?.(error);
      }
    },

    onError,
  });
}