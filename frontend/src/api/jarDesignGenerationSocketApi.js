/**
 * AI 후보 상태 변경 topic을 공용 STOMP 연결에 등록한다.
 * 이벤트는 갱신 신호로만 사용하고 실제 Draft 상태는 REST API에서 다시 확인한다.
 */
export function subscribeJarDesignGenerationSocket({
  subscribe,
  draftId,
  onGenerationChanged,
  onError,
}) {
  return subscribe({
    destination: `/topic/design-drafts/${draftId}/generations`,
    onMessage: (message) => {
      try {
        const event = JSON.parse(message.body);
        onGenerationChanged?.(event);
      } catch (error) {
        console.error("AI 생성 WebSocket 메시지 파싱 실패", error);
        onError?.(error);
      }
    },
    onError,
  });
}
