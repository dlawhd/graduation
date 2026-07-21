/*
 * chatSocketApi.js 역할
 *
 * 공용 STOMP Client에서 채팅 topic을 구독하고,
 * 채팅 메시지를 서버로 보내는 함수들을 관리한다.
 */
export function subscribeChatSocket({
  subscribe,
  jarId,
  onMessageReceived,
  onError,
}) {
  return subscribe({
    destination:
      `/topic/jars/${jarId}/chat`,

    onMessage: (message) => {
      try {
        const receivedMessage = JSON.parse(
          message.body
        );

        onMessageReceived?.(receivedMessage);
      } catch (error) {
        console.error(
          "채팅 WebSocket 메시지 파싱 실패",
          error
        );

        onError?.(error);
      }
    },

    onError,
  });
}

/*
 * 공용 STOMP Client로 채팅 메시지를 전송한다.
 */
export function sendChatSocketMessage({
  publish,
  jarId,
  content,
}) {
  publish({
    destination:
      `/app/jars/${jarId}/chat.send`,

    body: {
      content,
    },
  });
}