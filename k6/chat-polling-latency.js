// k6/chat-polling-latency.js

import http from "k6/http";
import { check, group, sleep } from "k6";
import { Counter, Trend } from "k6/metrics";

/*
 * chat-polling-latency.js 역할
 *
 * Polling 방식 채팅에서 "메시지 전달 지연 시간"을 측정하는 k6 테스트 파일이다.
 *
 * 쉽게 말하면:
 * - 가짜 사용자들이 일정 시간마다 새 메시지를 조회하고
 * - 가끔 메시지도 보내고
 * - 메시지 안에 들어 있는 sentAt 값을 보고
 * - "메시지를 보낸 시각부터 polling으로 발견한 시각까지 몇 ms 걸렸는지" 계산한다.
 *
 * 이 값이 WebSocket의 websocket_message_latency_ms와 비교할 수 있는 값이다.
 */

// 최대 가상 사용자 수
// 예: -e MAX_VUS=50
const MAX_VUS = Number(__ENV.MAX_VUS || 20);

// 올라가는 시간
// 예: -e RAMP_UP=30s
const RAMP_UP = __ENV.RAMP_UP || "30s";

// 최대 VU를 유지하는 시간
// 예: -e HOLD=60s
const HOLD = __ENV.HOLD || "60s";

// 내려가는 시간
// 예: -e RAMP_DOWN=30s
const RAMP_DOWN = __ENV.RAMP_DOWN || "30s";

// 테스트할 서버 주소
const BASE_URL = __ENV.BASE_URL || "http://localhost:8080";

// 테스트할 저금통 ID
const JAR_ID = __ENV.JAR_ID;

// 브라우저 개발자도구에서 복사한 Cookie 전체 값
const COOKIE = __ENV.COOKIE || "";

// CSRF 토큰 값
const XSRF_TOKEN = __ENV.XSRF_TOKEN || "";

// polling 주기
// 예: 3이면 3초마다 새 메시지 조회
const POLLING_INTERVAL_SECONDS = Number(__ENV.POLLING_INTERVAL_SECONDS || 3);

// 한 번에 가져올 메시지 개수
const LIMIT = Number(__ENV.LIMIT || 100);

// 메시지를 보낼 확률
// 0.1이면 각 반복마다 10% 확률로 메시지 전송
const SEND_RATE = Number(__ENV.SEND_RATE || 0.6);

// 각 VU가 마지막으로 본 메시지 ID를 기억한다.
// VU마다 따로 유지되는 값이다.
let lastMessageId = null;

// 같은 VU가 같은 메시지를 여러 번 측정하지 않도록 기억하는 Set
const measuredMessageIds = new Set();

// Polling 메시지 전달 지연 시간 측정용 지표
const pollingMessageLatency = new Trend("polling_message_latency_ms");

// 메시지 전송 수
const sentMessages = new Counter("polling_messages_sent");

// polling으로 발견한 테스트 메시지 수
const observedMessages = new Counter("polling_messages_observed");

if (!JAR_ID) {
  throw new Error("JAR_ID가 필요해. 예: -e JAR_ID=36");
}

export const options = {
  scenarios: {
    chat_polling_latency: {
      executor: "ramping-vus",
      stages: [
        { duration: RAMP_UP, target: MAX_VUS },
        { duration: HOLD, target: MAX_VUS },
        { duration: RAMP_DOWN, target: 0 },
      ],
    },
  },
  thresholds: {
    // 전체 check 성공률
    checks: ["rate>0.99"],

    // HTTP 요청 실패율
    http_req_failed: ["rate<0.01"],

    // Polling 방식 메시지 전달 지연 p95
    // polling 주기가 3초라면 p95는 3초 근처까지 갈 수 있으므로 4000ms로 시작한다.
    polling_message_latency_ms: ["p(95)<4000"],
  },
};

/*
 * 요청 헤더 만들기
 *
 * POST 요청에는 CSRF 토큰이 필요하고,
 * GET 요청은 보통 Cookie만 있어도 된다.
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
 * 서버 응답이 { data: 실제값 } 구조라서 data만 꺼낸다.
 */
function unwrapData(res) {
  const body = safeJson(res);

  if (!body) {
    return {};
  }

  if (body.data !== undefined && body.data !== null) {
    return body.data;
  }

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
 * content 안에서 sentAt 값을 꺼낸다.
 *
 * 예:
 * "k6 polling latency test - vu=1, iter=3, sentAt=1777470123456"
 */
function extractSentAt(content) {
  if (!content) {
    return null;
  }

  const match = String(content).match(/sentAt=(\d+)/);

  if (!match || !match[1]) {
    return null;
  }

  return Number(match[1]);
}

/*
 * polling으로 받은 메시지들에서 전달 지연 시간을 계산한다.
 */
function recordPollingLatency(items) {
  for (const item of items) {
    const messageId = Number(item.messageId || 0);

    // messageId가 없으면 측정하지 않는다.
    if (!messageId) {
      continue;
    }

    // 같은 VU 안에서 이미 측정한 메시지는 다시 측정하지 않는다.
    if (measuredMessageIds.has(messageId)) {
      continue;
    }

    // Polling latency 테스트 메시지만 측정한다.
    // WebSocket 테스트 메시지나 일반 채팅 메시지가 섞여도 제외하기 위함이다.
    if (!String(item.content).includes("k6 polling latency test")) {
      continue;
    }

    const sentAt = extractSentAt(item.content);

    // k6 테스트 메시지가 아니면 측정하지 않는다.
    if (!sentAt) {
      continue;
    }

    const latencyMs = Date.now() - sentAt;

    // 시간이 이상하면 제외한다.
    if (latencyMs < 0) {
      continue;
    }

    measuredMessageIds.add(messageId);

    // Polling 메시지 전달 지연 시간 기록
    pollingMessageLatency.add(latencyMs);

    // 실제로 몇 개의 메시지를 발견했는지 기록
    observedMessages.add(1);

    // 지연시간 측정 자체가 정상적으로 됐는지 확인
    check(latencyMs, {
      "Polling 메시지 전달 지연 측정 성공": (v) => v >= 0,
    });
  }
}

/*
 * 처음 채팅방에 들어왔을 때 기존 메시지를 조회한다.
 *
 * 여기서는 과거 메시지를 기준점으로 잡기만 하고,
 * 과거 메시지의 latency는 측정하지 않는다.
 */
function loadInitialMessages() {
  const url = `${BASE_URL}/api/v1/jars/${JAR_ID}/chat/messages?limit=${LIMIT}`;
  const res = http.get(url, makeParams("chat-initial-load"));

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
 * 새 메시지를 polling으로 조회한다.
 *
 * 이 함수가 Polling 전달 지연 시간을 측정하는 핵심이다.
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

  check(res, {
    "새 메시지 polling 조회 status 200": (r) => r.status === 200,
  });

  const payload = unwrapData(res);
  const items = extractItems(payload);

  // polling으로 새 메시지를 발견한 시점에 latency를 기록한다.
  recordPollingLatency(items);

  const newestId = findNewestMessageId(items);

  if (newestId > lastMessageId) {
    lastMessageId = newestId;
  }
}

/*
 * 가끔 메시지를 보낸다.
 *
 * 메시지 content 안에 sentAt을 넣어두면,
 * 나중에 polling으로 발견했을 때 전달 지연 시간을 계산할 수 있다.
 */
function maybeSendMessage() {
  if (Math.random() > SEND_RATE) {
    return;
  }

  const sentAt = Date.now();

  const url = `${BASE_URL}/api/v1/jars/${JAR_ID}/chat/messages`;

  const body = JSON.stringify({
    content: `k6 polling latency test - vu=${__VU}, iter=${__ITER}, sentAt=${sentAt}`,
  });

  const res = http.post(url, body, makeParams("chat-send", true));

  check(res, {
    "채팅 전송 status 201": (r) => r.status === 201,
  });

  const payload = unwrapData(res);
  const messageId = Number(payload.messageId || 0);

  if (messageId > 0) {
    sentMessages.add(1);
  }
}

/*
 * k6가 반복 실행하는 메인 함수
 */
export default function () {
  group("1. 새 메시지 polling 조회", () => {
    pollNewMessages();
  });

  group("2. 가끔 메시지 전송", () => {
    maybeSendMessage();
  });

  sleep(POLLING_INTERVAL_SECONDS);
}