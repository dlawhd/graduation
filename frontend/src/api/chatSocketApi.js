import { Client } from "@stomp/stompjs";
import { getWebSocketUrl } from "./socketUrl";

/*
 * chatSocketApi.js 역할
 *
 * 이 파일은 "저금통 채팅 WebSocket 연결"만 담당하는 파일이야.
 *
 * 쉽게 말하면:
 * - 서버 WebSocket 주소에 연결하고
 * - 특정 저금통 채팅방을 구독하고
 * - 메시지를 서버로 보내고
 * - 채팅방을 닫으면 연결을 끊는 역할을 해.
 *
 * 왜 따로 파일로 빼냐면?
 * JarDetailPage.jsx 안에 WebSocket 코드를 전부 넣으면 코드가 너무 길어짐
 * 그래서 연결 담당 코드는 이 파일에 모아두고, 화면에서는 필요한 함수만 가져다 쓰는 게 깔끔
 */

/*
 * 저금통 채팅 WebSocket 클라이언트를 만드는 함수
 *
 * jarId:
 * - 몇 번 저금통 채팅방에 연결할지 정하는 값
 *
 * onMessageReceived:
 * - 서버에서 새 메시지가 왔을 때 실행할 함수
 *
 * onConnect:
 * - WebSocket 연결에 성공했을 때 실행할 함수
 *
 * onError:
 * - WebSocket 연결 실패 또는 오류가 났을 때 실행할 함수
 */
export function createChatSocketClient({
  jarId,
  onMessageReceived,
  onConnect,
  onError,
}) {
  // STOMP 클라이언트를 생성한다.
  const client = new Client({
    // WebSocket 연결 주소
    brokerURL: getWebSocketUrl(),

    /*
     * debug는 WebSocket이 잘 연결되는지 콘솔에서 확인하는 용도
     * 최종적으로 다 끝나면 삭제
     */
    debug: (message) => {
      console.log("[STOMP]", message);
    },

    /*
     * 연결이 끊겼을 때 자동으로 다시 연결을 시도하는 시간
     * 3000ms = 3초
     */
    reconnectDelay: 3000,

    /*
     * 서버와 연결에 성공했을 때 실행된다.
     */
    onConnect: () => {
      console.log("채팅 WebSocket 연결 성공");

      /*
       * 이 저금통 채팅방을 구독한다.
       *
       * 서버가 보내는 주소:
       * /topic/jars/{jarId}/chat
       *
       * 예:
       * /topic/jars/36/chat
       */
      client.subscribe(`/topic/jars/${jarId}/chat`, (message) => {
        // 서버에서 받은 JSON 문자열을 JavaScript 객체로 바꾼다.
        const receivedMessage = JSON.parse(message.body);

        // 화면 쪽에서 넘겨준 함수로 새 메시지를 전달한다.
        onMessageReceived?.(receivedMessage);
      });

      // 연결 성공 후 실행할 추가 작업이 있으면 실행한다.
      onConnect?.();
    },

    /*
     * STOMP 자체 오류가 발생했을 때 실행된다.
     */
    onStompError: (frame) => {
      console.error("채팅 WebSocket STOMP 오류", frame);
      onError?.(frame);
    },

    /*
     * WebSocket 연결 오류가 발생했을 때 실행된다.
     */
    onWebSocketError: (event) => {
      console.error("채팅 WebSocket 연결 오류", event);
      onError?.(event);
    },
  });

  return client;
}

/*
 * 채팅 메시지를 WebSocket으로 보내는 함수
 *
 * client:
 * - createChatSocketClient로 만든 STOMP 클라이언트
 *
 * jarId:
 * - 메시지를 보낼 저금통 ID
 *
 * content:
 * - 사용자가 입력한 채팅 내용
 */
export function sendChatSocketMessage({ client, jarId, content }) {
  // 클라이언트가 없거나 연결되지 않았다면 메시지를 보내지 않는다.
  if (!client || !client.connected) {
    throw new Error("채팅 WebSocket이 아직 연결되지 않았어요.");
  }

  /*
   * 서버로 메시지를 보낸다.
   *
   * 프론트가 보내는 주소:
   * /app/jars/{jarId}/chat.send
   *
   * 서버의 ChatSocketController가 받는 주소:
   * @MessageMapping("/jars/{jarId}/chat.send")
   */
  client.publish({
    destination: `/app/jars/${jarId}/chat.send`,
    body: JSON.stringify({
      content,
    }),
  });
}

/*
 * 채팅 WebSocket 연결을 안전하게 끊는 함수
 *
 * 채팅 모달을 닫거나 페이지를 벗어날 때 사용한다.
 */
export function disconnectChatSocket(client) {
  // client가 있으면 연결을 끊는다.
  if (client) {
    client.deactivate();
  }
}