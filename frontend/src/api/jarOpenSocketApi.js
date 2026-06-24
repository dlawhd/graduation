import { Client } from "@stomp/stompjs";
import { getWebSocketUrl } from "./socketUrl";

/*
 * jarOpenSocketApi.js 역할
 *
 * 이 파일은 "저금통 오픈 실시간 이벤트" 연결만 담당한다.
 *
 * 쉽게 말하면:
 * - 프론트가 WebSocket 서버에 연결하고
 * - /topic/jars/{jarId}/open 을 구독하고
 * - 서버가 JAR_OPENED 이벤트를 보내면 화면 쪽 함수에 알려준다.
 */


/*
 * 저금통 오픈 WebSocket 클라이언트를 만든다.
 *
 * jarId:
 * - 몇 번 저금통의 오픈 이벤트를 받을지 정하는 값
 *
 * onJarOpened:
 * - 서버에서 JAR_OPENED 이벤트가 왔을 때 실행할 함수
 *
 * onConnect:
 * - WebSocket 연결 성공 시 실행할 함수
 *
 * onError:
 * - WebSocket 연결 실패 시 실행할 함수
 */
export function createJarOpenSocketClient({
  jarId,
  onJarOpened,
  onConnect,
  onError,
}) {
  const client = new Client({
    brokerURL: getWebSocketUrl(),

    /* 개발 중에는 연결 상태를 콘솔에서 확인하기 좋다.
    debug: (message) => {
      console.log("[JAR_OPEN_STOMP]", message);
    },*/

    // 연결이 끊기면 3초 뒤 재연결 시도
    reconnectDelay: 3000,

    onConnect: () => {
      // console.log("저금통 오픈 WebSocket 연결 성공");

      /*
       * 서버가 보내는 주소:
       * /topic/jars/{jarId}/open
       */
      client.subscribe(`/topic/jars/${jarId}/open`, (message) => {
        const event = JSON.parse(message.body);

        // JAR_OPENED 이벤트만 처리한다.
        if (event?.eventType === "JAR_OPENED") {
          onJarOpened?.(event);
        }
      });

      onConnect?.();
    },

    onStompError: (frame) => {
      console.error("저금통 오픈 WebSocket STOMP 오류", frame);
      onError?.(frame);
    },

    onWebSocketError: (event) => {
      console.error("저금통 오픈 WebSocket 연결 오류", event);
      onError?.(event);
    },
  });

  return client;
}

/*
 * 저금통 오픈 WebSocket 연결을 끊는다.
 *
 * 상세 페이지를 벗어나면 연결을 정리해야
 * 필요 없는 구독이 계속 남지 않는다.
 */
export function disconnectJarOpenSocket(client) {
  if (client) {
    client.deactivate();
  }
}