import { Client } from "@stomp/stompjs";
import { getWebSocketUrl } from "./socketUrl";

/*
 * notificationSocketApi.js 역할
 *
 * 이 파일은 "헤더 알림 WebSocket 연결"만 담당하는 파일
 *
 * 쉽게 말하면:
 * - 서버 WebSocket 주소에 연결한다.
 * - 내 알림 주소를 구독한다.
 * - 새 알림이 오면 App.jsx에 알려준다.
 * - 로그아웃하거나 화면을 벗어나면 연결을 끊는다.
 */


/*
 * 알림 WebSocket 클라이언트를 만드는 함수
 *
 * userId:
 * - 지금 로그인한 사용자 번호
 *
 * onNotificationReceived:
 * - 서버에서 새 알림이 왔을 때 실행할 함수
 *
 * onConnect:
 * - WebSocket 연결 성공 시 실행할 함수
 *
 * onError:
 * - WebSocket 오류 발생 시 실행할 함수
 */
export function createNotificationSocketClient({
  userId,
  onNotificationReceived,
  onConnect,
  onError,
}) {
  const client = new Client({
    // 실제 WebSocket 연결 주소
    brokerURL: getWebSocketUrl(),

    /*
     * 개발 중에는 연결 상태를 콘솔로 확인하면 좋아.
     * 배포 안정화가 끝나면 필요에 따라 주석 처리해도 돼.
     *
    debug: (message) => {
      console.log("[NOTIFICATION_STOMP]", message);
    },*/

    // 연결이 끊기면 3초 뒤 자동 재연결
    reconnectDelay: 3000,

    /*
     * 연결 성공 후 실행되는 부분
     *
     * 서버가 새 알림을 보내는 주소:
     * /topic/users/{userId}/notifications
     */
    onConnect: () => {
      // console.log("알림 WebSocket 연결 성공");

      client.subscribe(`/topic/users/${userId}/notifications`, (message) => {
        try {
          // 서버가 보낸 JSON 문자열을 JavaScript 객체로 바꾼다.
          const notification = JSON.parse(message.body);

          // App.jsx에서 넘겨준 함수로 새 알림을 전달한다.
          onNotificationReceived?.(notification);
        } catch (e) {
          console.error("알림 WebSocket 메시지 파싱 실패", e);
        }
      });

      onConnect?.();
    },

    // STOMP 프로토콜 오류가 났을 때 실행된다.
    onStompError: (frame) => {
      console.error("알림 WebSocket STOMP 오류", frame);
      onError?.(frame);
    },

    // WebSocket 연결 자체에 문제가 생겼을 때 실행된다.
    onWebSocketError: (event) => {
      console.error("알림 WebSocket 연결 오류", event);
      onError?.(event);
    },
  });

  return client;
}

/*
 * 알림 WebSocket 연결을 안전하게 끊는 함수
 *
 * 로그아웃하거나 App이 정리될 때 사용한다.
 */
export function disconnectNotificationSocket(client) {
  if (client) {
    client.deactivate();
  }
}