import { Client } from "@stomp/stompjs";
import { getWebSocketUrl } from "./socketUrl";

/*
 * dailyDrawSocketApi.js 역할
 *
 * 이 파일은 "오늘의 추억 한 장(Daily Draw) WebSocket 연결"만 담당한다.
 *
 * 쉽게 말하면:
 * - 프론트가 WebSocket 서버에 연결하고
 * - /topic/jars/{jarId}/daily-draw 주소를 구독하고
 * - 서버가 DAILY_DRAW_REVEALED 이벤트를 보내면 화면 쪽 함수에 알려준다.
 *
 * 왜 따로 파일로 빼냐면?
 * - JarDetailPage.jsx 안에 WebSocket 연결 코드를 전부 넣으면 코드가 너무 길어진다.
 * - 그래서 Daily Draw 실시간 연결 담당 코드는 이 파일에 모아두고,
 *   화면에서는 필요한 함수만 가져다 쓰는 게 깔끔하다.
 */

/*
 * Daily Draw WebSocket 클라이언트를 만드는 함수
 *
 * jarId:
 * - 몇 번 저금통의 Daily Draw 이벤트를 받을지 정하는 값
 *
 * onDailyDrawRevealed:
 * - 서버에서 DAILY_DRAW_REVEALED 이벤트가 왔을 때 실행할 함수
 *
 * onConnect:
 * - WebSocket 연결 성공 시 실행할 함수
 *
 * onError:
 * - WebSocket 연결 실패 또는 STOMP 오류 발생 시 실행할 함수
 */
export function createDailyDrawSocketClient({
  jarId,
  onDailyDrawRevealed,
  onConnect,
  onError,
}) {
  const client = new Client({
    // 실제 WebSocket 연결 주소
    brokerURL: getWebSocketUrl(),

    /*
     * 개발 중에는 연결 상태를 콘솔로 확인하면 좋다.
     * 배포 안정화가 끝나면 필요에 따라 주석 처리해도 된다.

    debug: (message) => {
      console.log("[DAILY_DRAW_STOMP]", message);
    },
    */

    // 연결이 끊기면 3초 뒤 자동 재연결을 시도한다.
    reconnectDelay: 3000,

    /*
     * WebSocket 연결이 성공했을 때 실행된다.
     */
    onConnect: () => {
      // console.log("Daily Draw WebSocket 연결 성공");

      /*
       * 서버가 Daily Draw 이벤트를 보내는 주소
       *
       * 예:
       * /topic/jars/10/daily-draw
       */
      client.subscribe(`/topic/jars/${jarId}/daily-draw`, (message) => {
        try {
          // 서버에서 받은 JSON 문자열을 JavaScript 객체로 바꾼다.
          const event = JSON.parse(message.body);

          /*
           * DAILY_DRAW_REVEALED 이벤트만 화면에 전달한다.
           *
           * 혹시 나중에 다른 이벤트 타입이 추가되어도
           * 여기서 구분해서 처리할 수 있다.
           */
          if (event?.eventType === "DAILY_DRAW_REVEALED") {
            onDailyDrawRevealed?.(event);
          }
        } catch (e) {
          // JSON 파싱에 실패하면 화면이 터지지 않도록 콘솔에만 남긴다.
          console.error("Daily Draw WebSocket 메시지 파싱 실패", e);
          onError?.(e);
        }
      });

      // 연결 성공 후 화면 쪽에서 추가로 할 일이 있으면 실행한다.
      onConnect?.();
    },

    /*
     * STOMP 프로토콜 자체에서 오류가 났을 때 실행된다.
     */
    onStompError: (frame) => {
      console.error("Daily Draw WebSocket STOMP 오류", frame);
      onError?.(frame);
    },

    /*
     * WebSocket 연결 자체에 문제가 생겼을 때 실행된다.
     */
    onWebSocketError: (event) => {
      console.error("Daily Draw WebSocket 연결 오류", event);
      onError?.(event);
    },
  });

  return client;
}

/*
 * Daily Draw WebSocket 연결을 안전하게 끊는 함수
 *
 * 상세 페이지를 벗어나거나 jarId가 바뀌면
 * 기존 연결을 정리해야 필요 없는 구독이 계속 남지 않는다.
 */
export function disconnectDailyDrawSocket(client) {
  if (client) {
    client.deactivate();
  }
}