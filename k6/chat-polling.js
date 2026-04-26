import http from "k6/http";
import { check, group, sleep } from "k6";
import { Counter } from "k6/metrics";

/*
 * chat-polling.js 역할
 *
 * Polling 방식 저금통 채팅이 서버에 얼마나 부담을 주는지 확인하는 k6 테스트 파일
 *
 * 쉽게 말하면:
 * - 가짜 사용자들이 채팅방에 들어온 척하고
 * - 일정 시간마다 새 메시지가 있는지 확인하고
 * - 가끔 메시지도 보내고
 * - 읽음 처리도 하면서
 * - 서버가 잘 버티는지 확인한다.
 */

export const options = {
  scenarios: {
    chat_polling: {
      executor: "ramping-vus",
      stages: [
        { duration: "30s", target: 20 },
        { duration: "30s", target: 0 },
      ],
    },
  },

  thresholds: {
    // 전체 요청 실패율은 1% 미만이면 통과
    http_req_failed: ["rate<0.01"],

    // check 성공률은 99% 이상이면 통과
    checks: ["rate>0.99"],

    // 새 메시지 polling 조회 95%가 800ms 안에 끝나는지 확인
    "http_req_duration{api:chat-new-poll}": ["p(95)<800"],

    // 메시지 전송 95%가 1000ms 안에 끝나는지 확인
    "http_req_duration{api:chat-send}": ["p(95)<1000"],

    // 읽음 처리 95%가 800ms 안에 끝나는지 확인
    "http_req_duration{api:chat-read}": ["p(95)<800"],

    // unread 조회 95%가 800ms 안에 끝나는지 확인
    "http_req_duration{api:chat-unread}": ["p(95)<800"],
  },
};

// 테스트할 서버 주소
const BASE_URL = __ENV.BASE_URL || "http://localhost:8080";

// 테스트할 저금통 ID
const JAR_ID = __ENV.JAR_ID;

// 브라우저 개발자도구에서 복사한 Cookie 전체 값
const COOKIE = __ENV.COOKIE || "";

// CSRF 토큰 값
const XSRF_TOKEN = __ENV.XSRF_TOKEN || "";

// 프론트 Polling 주기와 비슷하게 맞춤
const POLLING_INTERVAL_SECONDS = Number(__ENV.POLLING_INTERVAL_SECONDS || 3);

// 한 번에 가져올 메시지 개수
const LIMIT = Number(__ENV.LIMIT || 30);

// 메시지를 보낼 확률
const SEND_RATE = Number(__ENV.SEND_RATE || 0.1);

// 각 가상 사용자마다 마지막으로 본 메시지 ID를 기억
let lastMessageId = null;

// 메시지 전송 횟수 기록용
const sentMessages = new Counter("chat_messages_sent");

if (!JAR_ID) {
  throw new Error("JAR_ID가 필요해. 예: -e JAR_ID=43");
}

function logFailedResponse(name, res) {
  // 너무 많이 찍히면 보기 힘드니까 1번 가상 사용자, 첫 반복에서만 출력
  if (__VU === 1 && __ITER === 0 && res.status >= 300) {
    console.log("[" + name + "] failed");
    console.log("status = " + res.status);
    console.log("body = " + res.body.substring(0, 500));
  }
}

/*
 * 요청 헤더 만들기
 *
 * GET은 보통 CSRF가 필요 없고,
 * POST는 X-XSRF-TOKEN이 필요해.
 */
function makeParams(apiName, needCsrf = false) {
  const headers = {
    "Content-Type": "application/json",
  };

  if (COOKIE) {
    headers.Cookie = COOKIE;
  }

  if (needCsrf && XSRF_TOKEN) {
    headers["X-XSRF-TOKEN"] = XSRF_TOKEN;
  }

  return {
    headers,
    tags: {
      api: apiName,
    },
  };
}

/*
 * JSON을 안전하게 읽는 함수
 */
function safeJson(res) {
  try {
    return res.json();
  } catch (e) {
    return null;
  }
}

/*
 * 서버 응답이 { data: 실제값 } 구조라서 data만 꺼냄
 */
function unwrapData(res) {
  const body = safeJson(res);

  // body가 없으면 빈 객체 반환
  if (!body) {
    return {};
  }

  // 서버 응답이 { data: ... } 구조면 data만 꺼내기
  if (body.data !== undefined && body.data !== null) {
    return body.data;
  }

  // data가 없으면 body 자체 반환
  return body;
}

/*
 * 응답에서 items 배열 꺼내기
 */
function extractItems(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (Array.isArray(payload.items)) {
    return payload.items;
  }

  return [];
}

/*
 * 메시지 목록에서 가장 큰 messageId 찾기
 */
function findNewestMessageId(items) {
  return items.reduce((maxId, item) => {
    const id = Number(item.messageId || 0);
    return id > maxId ? id : maxId;
  }, 0);
}

/*
 * 처음 채팅방 들어왔을 때 기존 메시지 조회
 *
 * GET /api/v1/jars/{jarId}/chat/messages
 */
function loadInitialMessages() {
  const url = `${BASE_URL}/api/v1/jars/${JAR_ID}/chat/messages?limit=${LIMIT}`;

  const res = http.get(url, makeParams("chat-initial-load"));
  logFailedResponse("기존 메시지 조회", res);

  check(res, {
    "기존 메시지 조회 status 200": (r) => r.status === 200,
  });

  const payload = unwrapData(res);
  const items = extractItems(payload);
  const newestId = findNewestMessageId(items);

  if (newestId > 0) {
    lastMessageId = newestId;
  }
}

/*
 * Polling 새 메시지 조회
 *
 * GET /api/v1/jars/{jarId}/chat/messages/new?afterMessageId={lastMessageId}
 */
function pollNewMessages() {
  if (lastMessageId === null) {
    loadInitialMessages();
    return;
  }

  const url =
    `${BASE_URL}/api/v1/jars/${JAR_ID}/chat/messages/new` +
    `?afterMessageId=${lastMessageId}&limit=${LIMIT}`;

  const res = http.get(url, makeParams("chat-new-poll"));
  logFailedResponse("새 메시지 조회", res);

  check(res, {
    "새 메시지 polling 조회 status 200": (r) => r.status === 200,
  });

  const payload = unwrapData(res);
  const items = extractItems(payload);
  const newestId = findNewestMessageId(items);

  if (newestId > lastMessageId) {
    lastMessageId = newestId;
  }
}

/*
 * 가끔 메시지 보내기
 *
 * POST /api/v1/jars/{jarId}/chat/messages
 */
function maybeSendMessage() {
  if (Math.random() > SEND_RATE) {
    return;
  }

  const url = `${BASE_URL}/api/v1/jars/${JAR_ID}/chat/messages`;

  const body = JSON.stringify({
    content: `k6 polling test message - vu=${__VU}, iter=${__ITER}`,
  });

  const res = http.post(url, body, makeParams("chat-send", true));
  logFailedResponse("채팅 전송", res);

  check(res, {
    "채팅 전송 status 201": (r) => r.status === 201,
  });

  const payload = unwrapData(res);
  const messageId = Number(payload.messageId || 0);

  if (messageId > 0) {
    lastMessageId = Math.max(lastMessageId || 0, messageId);
    sentMessages.add(1);
  }
}

/*
 * 읽음 처리
 *
 * POST /api/v1/jars/{jarId}/chat/read
 */
function markAsRead() {
  if (!lastMessageId) {
    return;
  }

  const url = `${BASE_URL}/api/v1/jars/${JAR_ID}/chat/read`;

  const body = JSON.stringify({
    lastReadMessageId: lastMessageId,
  });

  const res = http.post(url, body, makeParams("chat-read", true));

  check(res, {
    "읽음 처리 status 200": (r) => r.status === 200,
  });
}

/*
 * unread count 조회
 *
 * GET /api/v1/jars/{jarId}/chat/unread
 */
function getUnreadCount() {
  const url = `${BASE_URL}/api/v1/jars/${JAR_ID}/chat/unread`;

  const res = http.get(url, makeParams("chat-unread"));
  logFailedResponse("unread 조회", res);

  check(res, {
    "unread 조회 status 200": (r) => r.status === 200,
  });
}

/*
 * k6가 반복 실행하는 메인 함수
 */
export default function () {
  group("1. Polling 새 메시지 조회", () => {
    pollNewMessages();
  });

  group("2. 가끔 메시지 전송", () => {
    maybeSendMessage();
  });

  group("3. 읽음 처리", () => {
    if (Math.random() < 0.5) {
      markAsRead();
    }
  });

  group("4. unread count 조회", () => {
    getUnreadCount();
  });

  sleep(POLLING_INTERVAL_SECONDS);
}