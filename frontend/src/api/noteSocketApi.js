import { Client } from "@stomp/stompjs";
import { getWebSocketUrl } from "./socketUrl";

/*
 * noteSocketApi.js 역할
 *
 * 이 파일은 "쪽지 상세 화면 WebSocket 연결"만 담당하는 파일이야.
 *
 * 쉽게 말하면:
 * - 쪽지 상세 모달을 열었을 때 서버 WebSocket에 연결하고
 * - /topic/jars/{jarId}/notes/{noteId} 주소를 구독하고
 * - 댓글/답글/리액션 변화가 오면 JarDetailPage.jsx에 알려줘.
 */

/*
 * 쪽지 상세 WebSocket 클라이언트를 만든다.
 */
export function createNoteSocketClient({
  jarId,
  noteId,
  onNoteEventReceived,
  onConnect,
  onError,
}) {
  const client = new Client({
    brokerURL: getWebSocketUrl(),

    // 개발 중에는 연결 상태를 콘솔에서 확인할 수 있게 한다.
    debug: (message) => {
      console.log("[NOTE_STOMP]", message);
    },

    // 연결이 끊기면 3초 뒤 다시 연결한다.
    reconnectDelay: 3000,

    onConnect: () => {
      console.log("쪽지 상세 WebSocket 연결 성공");

      /*
       * 서버가 쪽지 상세 이벤트를 보내는 주소:
       * /topic/jars/{jarId}/notes/{noteId}
       */
      client.subscribe(`/topic/jars/${jarId}/notes/${noteId}`, (message) => {
        try {
          const event = JSON.parse(message.body);
          onNoteEventReceived?.(event);
        } catch (e) {
          console.error("쪽지 상세 WebSocket 메시지 파싱 실패", e);
        }
      });

      onConnect?.();
    },

    onStompError: (frame) => {
      console.error("쪽지 상세 WebSocket STOMP 오류", frame);
      onError?.(frame);
    },

    onWebSocketError: (event) => {
      console.error("쪽지 상세 WebSocket 연결 오류", event);
      onError?.(event);
    },
  });

  return client;
}

/*
 * 쪽지 상세 WebSocket 연결을 안전하게 끊는다.
 */
export function disconnectNoteSocket(client) {
  if (client) {
    client.deactivate();
  }
}