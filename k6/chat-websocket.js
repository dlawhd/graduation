/*
 * chat-websocket.js 역할
 *
 * WebSocket 방식 저금통 채팅이 서버에 얼마나 부담을 주는지 확인하는 k6 테스트 파일이다.
 *
 * 쉽게 말하면:
 * - 가짜 사용자들이 WebSocket으로 채팅방에 들어오고
 * - STOMP CONNECT를 하고
 * - 특정 저금통 채팅방을 구독하고
 * - 일정 시간마다 메시지를 보내고
 * - 서버가 메시지를 다시 보내주는지 확인한다.
 */

import ws from "k6/ws";
import { check, sleep } from "k6";
import { Counter, Rate } from "k6/metrics";

/*
 * 테스트 조건
 *
 * Polling 테스트와 비교하기 위해 VU 조건을 비슷하게 맞춘다.
 * 현재 Polling 테스트도 20명까지 올렸다가 내리는 구조였으므로,
 * WebSocket 테스트도 20명 기준으로 먼저 비교한다.
 */
export const options = {
  scenarios: {
    chat_websocket: {
      executor: "ramping-vus",
      stages: [
        { duration: "30s", target: 20 },
        { duration: "30s", target: 0 },
      ],
    },
  },
  thresholds: {
    // WebSocket 연결 성공률
    websocket_connected: ["rate>0.99"],

    // STOMP CONNECTED 프레임 수신 성공률
    stomp_connected: ["rate>0.99"],

    // 서버 MESSAGE 수신 성공률
    stomp_message_received: ["rate>0.95"],

    // 전체 check 성공률
    checks: ["rate>0.95"],
  },
};

/*
 * 환경변수
 *
 * WS_URL:
 * - 로컬: ws://localhost:8080/ws
 * - 배포: wss://api.esjh.shop/ws
 *
 * JAR_ID:
 * - 테스트할 저금통 ID
 *
 * COOKIE:
 * - 브라우저 개발자도구에서 복사한 Cookie 전체 값
 * - WebSocket도 로그인 사용자를 알아야 하므로 쿠키가 필요하다.
 */
const WS_URL = __ENV.WS_URL || "ws://localhost:8080/ws";
const JAR_ID = __ENV.JAR_ID;
const COOKIE = __ENV.COOKIE || "";

// 메시지를 몇 초마다 보낼지
const SEND_INTERVAL_MS = Number(__ENV.SEND_INTERVAL_MS || 3000);

// 연결을 몇 초 동안 유지할지
const SESSION_SECONDS = Number(__ENV.SESSION_SECONDS || 30);

/*
 * 커스텀 지표
 *
 * 결과표에서 WebSocket 성공 여부를 더 보기 쉽게 하기 위한 카운터/비율이다.
 */
const websocketConnected = new Rate("websocket_connected");
const stompConnected = new Rate("stomp_connected");
const stompMessageReceived = new Rate("stomp_message_received");

const sentMessages = new Counter("websocket_messages_sent");
const receivedMessages = new Counter("websocket_messages_received");

if (!JAR_ID) {
  throw new Error("JAR_ID가 필요해. 예: -e JAR_ID=36");
}

/*
 * STOMP 프레임 끝에는 반드시 \x00(NULL 문자)이 붙어야 한다.
 *
 * 쉽게 말하면:
 * STOMP 서버에게 "여기까지가 한 메시지야"라고 알려주는 마침표 같은 역할이다.
 */
function frame(command, headers = {}, body = "") {
  let result = command + "\n";

  for (const key in headers) {
    result += `${key}:${headers[key]}\n`;
  }

  result += "\n";
  result += body;
  result += "\x00";

  return result;
}

/*
 * STOMP CONNECT 프레임
 *
 * WebSocket 문을 연 다음,
 * "나 STOMP 방식으로 대화할게"라고 서버에 말하는 단계다.
 */
function connectFrame() {
  return frame("CONNECT", {
    "accept-version": "1.2,1.1,1.0",
    "heart-beat": "10000,10000",
  });
}

/*
 * STOMP SUBSCRIBE 프레임
 *
 * 특정 저금통 채팅방을 구독한다.
 *
 * 예:
 * /topic/jars/36/chat
 *
 * 의미:
 * 36번 저금통 채팅방 메시지를 받을 준비를 한다.
 */
function subscribeFrame() {
  return frame("SUBSCRIBE", {
    id: `sub-${__VU}`,
    destination: `/topic/jars/${JAR_ID}/chat`,
  });
}

/*
 * STOMP SEND 프레임
 *
 * 특정 저금통 채팅방으로 메시지를 보낸다.
 *
 * 예:
 * /app/jars/36/chat.send
 *
 * 의미:
 * 서버의 @MessageMapping 쪽으로 채팅 메시지를 보낸다.
 */
function sendChatFrame() {
  const body = JSON.stringify({
    content: `k6 websocket test message - vu=${__VU}, iter=${__ITER}, time=${Date.now()}`,
  });

  return frame(
    "SEND",
    {
      destination: `/app/jars/${JAR_ID}/chat.send`,
      "content-type": "application/json",
      "content-length": body.length,
    },
    body
  );
}

/*
 * k6가 반복 실행하는 메인 함수
 */
export default function () {
  const params = {
    headers: {
      Origin: "https://www.esjh.shop",
    },
  };

  // 로그인 쿠키가 있으면 WebSocket handshake 요청에 함께 보낸다.
  if (COOKIE) {
    params.headers.Cookie = COOKIE;
  }

  const response = ws.connect(WS_URL, params, function (socket) {
    let isStompConnected = false;
    let receivedMessageCount = 0;

    /*
     * WebSocket 연결이 열린 순간
     */
    socket.on("open", function () {
      websocketConnected.add(true);

      // WebSocket이 열리면 STOMP CONNECT를 보낸다.
      socket.send(connectFrame());
    });

    /*
     * 서버에서 메시지를 받을 때마다 실행된다.
     */
    socket.on("message", function (data) {
      const text = String(data);

      // STOMP 연결 성공 확인
      if (text.includes("CONNECTED")) {
        isStompConnected = true;
        stompConnected.add(true);

        // 연결 성공 후 채팅방 구독
        socket.send(subscribeFrame());

        // SEND_RATE=0이면 메시지를 보내지 않고, 연결/구독만 테스트한다.
        if (SHOULD_SEND) {
          socket.send(sendChatFrame());
          sentMessages.add(1);
        }
      }

      // 서버가 채팅 메시지를 다시 내려준 경우
      if (text.includes("MESSAGE") && text.includes(`/topic/jars/${JAR_ID}/chat`)) {
        receivedMessageCount += 1;
        receivedMessages.add(1);
        stompMessageReceived.add(true);
      }
    });

    /*
     * 연결 중 일정 시간마다 메시지 전송
     */
    socket.setInterval(function () {
      // STOMP 연결이 안 됐으면 메시지를 보내지 않는다.
      if (!isStompConnected) {
        return;
      }

      // SEND_RATE=0이면 메시지를 보내지 않는다.
      if (!SHOULD_SEND) {
        return;
      }

      socket.send(sendChatFrame());
      sentMessages.add(1);
    }, SEND_INTERVAL_MS);

    /*
     * 정해진 시간이 지나면 연결 종료
     */
    socket.setTimeout(function () {
      check(isStompConnected, {
        "STOMP CONNECTED 수신 성공": (value) => value === true,
      });

      check(receivedMessageCount, {
        "WebSocket MESSAGE 1개 이상 수신": (value) => value > 0,
      });

      socket.close();
    }, SESSION_SECONDS * 1000);

    /*
     * 에러가 발생했을 때
     */
    socket.on("error", function (e) {
      websocketConnected.add(false);
      stompConnected.add(false);
      stompMessageReceived.add(false);

      console.log(`WebSocket error: ${e.error()}`);
    });
  });

  check(response, {
    "WebSocket handshake status 101": (r) => r && r.status === 101,
  });

  sleep(1);
}