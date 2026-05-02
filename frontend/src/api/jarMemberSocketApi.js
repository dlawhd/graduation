import { Client } from "@stomp/stompjs";

/*
 * jarMemberSocketApi.js 역할
 *
 * 이 파일은 "저금통 멤버 변화 WebSocket 연결"만 담당하는 파일이야.
 *
 * 쉽게 말하면:
 * - 저금통 상세 화면에 들어왔을 때 서버 WebSocket에 연결하고
 * - /topic/jars/{jarId}/members 주소를 구독하고
 * - 누가 들어오거나, 나가거나, 강퇴되거나, 역할이 바뀌면
 * - JarDetailPage.jsx에 알려주는 역할을 해.
 */

function getWebSocketUrl() {
  // 로컬 프론트에서 실행 중이면 로컬 백엔드 WebSocket으로 연결한다.
  if (window.location.hostname === "localhost") {
    return "ws://localhost:8080/ws";
  }

  // 배포 환경에서는 보안 WebSocket 주소를 사용한다.
  return "wss://api.esjh.shop/ws";
}

/*
 * 저금통 멤버 변화 WebSocket 클라이언트를 만든다.
 */
export function createJarMemberSocketClient({
  jarId,
  onMemberEventReceived,
  onConnect,
  onError,
}) {
  const client = new Client({
    brokerURL: getWebSocketUrl(),

    // 개발 중에는 연결 상태를 보기 좋게 콘솔에 찍어준다.
    debug: (message) => {
      console.log("[JAR_MEMBER_STOMP]", message);
    },

    // 연결이 끊기면 3초 뒤 자동 재연결
    reconnectDelay: 3000,

    onConnect: () => {
      console.log("저금통 멤버 WebSocket 연결 성공");

      /*
       * 서버가 멤버 변화 이벤트를 보내는 주소:
       * /topic/jars/{jarId}/members
       */
      client.subscribe(`/topic/jars/${jarId}/members`, (message) => {
        try {
          const event = JSON.parse(message.body);
          onMemberEventReceived?.(event);
        } catch (e) {
          console.error("저금통 멤버 WebSocket 메시지 파싱 실패", e);
        }
      });

      onConnect?.();
    },

    onStompError: (frame) => {
      console.error("저금통 멤버 WebSocket STOMP 오류", frame);
      onError?.(frame);
    },

    onWebSocketError: (event) => {
      console.error("저금통 멤버 WebSocket 연결 오류", event);
      onError?.(event);
    },
  });

  return client;
}

/*
 * 저금통 멤버 WebSocket 연결을 안전하게 끊는다.
 */
export function disconnectJarMemberSocket(client) {
  if (client) {
    client.deactivate();
  }
}