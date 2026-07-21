import { Client } from "@stomp/stompjs";
import { getWebSocketUrl } from "./socketUrl";

/*
 * noteSocketApi.js 역할
 *
 * 저금통 안의 모든 쪽지 변경 이벤트를
 * WebSocket으로 받는 연결을 담당한다.
 *
 * 쉽게 말하면:
 * - 저금통 상세 페이지에 들어오면 WebSocket에 연결하고
 * - /topic/jars/{jarId}/notes 주소를 한 번 구독하고
 * - 댓글·답글·리액션 변화가 오면 화면에 알려준다.
 *
 * 실제로 변경할 쪽지는 이벤트 안의 noteId로 구분한다.
 */

/*
 * 저금통 전체 쪽지 WebSocket 클라이언트를 만든다.
 */
export function createJarNoteSocketClient({
  jarId,
  onNoteEventReceived,
  onConnect,
  onError,
}) {
  const client = new Client({
    brokerURL: getWebSocketUrl(),

    /*
     * 개발 중 STOMP 메시지를 확인하고 싶을 때만 사용한다.
     *
     * debug: (message) => {
     *   console.log("[NOTE_STOMP]", message);
     * },
     */

    // 연결이 끊어지면 3초 뒤 다시 연결한다.
    reconnectDelay: 3000,

    onConnect: () => {
      /*
       * 특정 쪽지 하나가 아니라
       * 현재 저금통 안의 모든 쪽지 변경 이벤트를 구독한다.
       */
      client.subscribe(
        `/topic/jars/${jarId}/notes`,
        (message) => {
          try {
            const event = JSON.parse(message.body);

            onNoteEventReceived?.(event);
          } catch (error) {
            console.error(
              "저금통 쪽지 WebSocket 메시지 파싱 실패",
              error
            );
          }
        }
      );

      onConnect?.();
    },

    onStompError: (frame) => {
      console.error(
        "저금통 쪽지 WebSocket STOMP 오류",
        frame
      );

      onError?.(frame);
    },

    onWebSocketError: (event) => {
      console.error(
        "저금통 쪽지 WebSocket 연결 오류",
        event
      );

      onError?.(event);
    },
  });

  return client;
}

/*
 * 저금통 전체 쪽지 WebSocket 연결을 안전하게 끊는다.
 */
export function disconnectJarNoteSocket(client) {
  if (client) {
    client.deactivate();
  }
}