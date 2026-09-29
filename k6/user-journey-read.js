import http from "k6/http";
import { check, sleep } from "k6";
import { Rate } from "k6/metrics";

/**
 * 실제 사용자가 저금통 목록과 상세 화면을 둘러보는 흐름을 GET 요청만으로 재현한다.
 * 운영 데이터와 외부 유료 API를 변경하지 않고 HTTP 조회 성능의 기준선을 측정한다.
 */

const BASE_URL = __ENV.BASE_URL || "http://localhost:8080";
const COOKIE = __ENV.COOKIE || "";
const JAR_IDS = (__ENV.JAR_IDS || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

const MAX_VUS = positiveNumber(__ENV.MAX_VUS, 10);
const RAMP_UP = __ENV.RAMP_UP || "30s";
const HOLD = __ENV.HOLD || "2m";
const RAMP_DOWN = __ENV.RAMP_DOWN || "30s";
const REQUEST_TIMEOUT = __ENV.REQUEST_TIMEOUT || "5s";
const MIN_THINK_SECONDS = positiveNumber(__ENV.MIN_THINK_SECONDS, 2);
const MAX_THINK_SECONDS = Math.max(
  MIN_THINK_SECONDS,
  positiveNumber(__ENV.MAX_THINK_SECONDS, 5)
);
const DIAGNOSTIC = (__ENV.DIAGNOSTIC || "").toLowerCase() === "true";

const readRequestSuccess = new Rate("read_request_success");

if (!COOKIE) {
  throw new Error("COOKIE 환경변수가 필요합니다. 인증 쿠키를 파일이나 Git에 저장하지 마세요.");
}

if (JAR_IDS.length === 0) {
  throw new Error("JAR_IDS 환경변수가 필요합니다. 예: JAR_IDS=99,100");
}

const loadTestOptions = {
  discardResponseBodies: true,
  scenarios: {
    user_journey_read: {
      executor: "ramping-vus",
      stages: [
        { duration: RAMP_UP, target: MAX_VUS },
        { duration: HOLD, target: MAX_VUS },
        { duration: RAMP_DOWN, target: 0 },
      ],
      gracefulRampDown: "15s",
    },
  },
  thresholds: {
    // 인증 만료나 서버 오류가 쌓이면 다음 부하 단계로 진행하지 않도록 조기에 멈춘다.
    http_req_failed: [
      { threshold: "rate<0.03", abortOnFail: true, delayAbortEval: "30s" },
    ],
    checks: ["rate>0.97"],
    read_request_success: ["rate>0.97"],
    http_req_duration: ["p(95)<800", "p(99)<2000"],
    "http_req_duration{api:jar-list}": ["p(95)<800"],
    "http_req_duration{api:jar-detail}": ["p(95)<800"],
    "http_req_duration{api:note-list}": ["p(95)<800"],
  },
};

const diagnosticOptions = {
  discardResponseBodies: true,
  scenarios: {
    authenticated_read_diagnostic: {
      executor: "shared-iterations",
      exec: "diagnostic",
      vus: 1,
      iterations: 1,
      maxDuration: "30s",
    },
  },
};

export const options = DIAGNOSTIC ? diagnosticOptions : loadTestOptions;

/** 테스트 시작 전에 인증 쿠키와 대표 Jar 접근 권한을 한 번 검증한다. */
export function setup() {
  const meResponse = http.get(`${BASE_URL}/api/v1/me`, requestParams("auth-check"));
  const jarResponse = http.get(
    `${BASE_URL}/api/v1/jars/${JAR_IDS[0]}`,
    requestParams("jar-access-check")
  );

  const authenticated = check(meResponse, {
    "사전 인증 확인 성공": (response) =>
      response.status === 200 && isJsonResponse(response),
  });
  const canReadJar = check(jarResponse, {
    "사전 Jar 접근 확인 성공": (response) =>
      response.status === 200 && isJsonResponse(response),
  });

  if (!authenticated || !canReadJar) {
    throw new Error(
      `사전 검증 실패: authStatus=${meResponse.status}, jarStatus=${jarResponse.status}`
    );
  }
}

/**
 * 화면 사용 비율에 맞춰 매 반복마다 조회 API 한 개만 호출한다.
 * 요청 사이에는 생각 시간을 둬서 500 VU를 500 RPS로 잘못 해석하지 않도록 한다.
 */
export default function () {
  const jarId = selectJarId();
  const roll = Math.random() * 100;

  if (roll < 25) {
    request("jar-list", "/api/v1/jars?page=0&size=3");
  } else if (roll < 45) {
    request("jar-detail", `/api/v1/jars/${jarId}`);
  } else if (roll < 60) {
    request("note-list", `/api/v1/jars/${jarId}/notes?page=0&size=24`);
  } else if (roll < 70) {
    request("jar-members", `/api/v1/jars/${jarId}/members`);
  } else if (roll < 80) {
    request("notification-list", "/api/v1/notifications?page=0&size=10");
  } else if (roll < 90) {
    request("notification-unread", "/api/v1/notifications/unread-count");
  } else if (roll < 97) {
    request("chat-history", `/api/v1/jars/${jarId}/chat/messages?limit=30`);
  } else {
    request("chat-unread", `/api/v1/jars/${jarId}/chat/unread`);
  }

  sleep(randomThinkSeconds());
}

/**
 * 본 부하 테스트 전에 각 읽기 API의 실제 HTTP 상태를 한 번씩 확인한다.
 * 인증값과 응답 본문은 남기지 않아 운영 개인정보와 비밀값이 로그에 노출되지 않게 한다.
 */
export function diagnostic() {
  const jarId = JAR_IDS[0];
  const probes = [
    ["jar-list", "/api/v1/jars?page=0&size=3"],
    ["jar-detail", `/api/v1/jars/${jarId}`],
    ["note-list", `/api/v1/jars/${jarId}/notes?page=0&size=24`],
    ["jar-members", `/api/v1/jars/${jarId}/members`],
    ["notification-list", "/api/v1/notifications?page=0&size=10"],
    ["notification-unread", "/api/v1/notifications/unread-count"],
    ["chat-history", `/api/v1/jars/${jarId}/chat/messages?limit=30`],
    ["chat-unread", `/api/v1/jars/${jarId}/chat/unread`],
  ];

  for (const [apiName, path] of probes) {
    const response = http.get(`${BASE_URL}${path}`, requestParams(apiName));
    console.log(`[READ_DIAGNOSTIC] api=${apiName} status=${response.status}`);
    sleep(1);
  }
}

/** GET 이외의 메서드가 실수로 추가되지 않도록 조회 요청을 한 함수로 제한한다. */
function request(apiName, path) {
  const response = http.get(`${BASE_URL}${path}`, requestParams(apiName));
  const succeeded = check(response, {
    [`${apiName} HTTP 200`]: (result) => result.status === 200,
  });
  readRequestSuccess.add(succeeded, { api: apiName });

  // 첫 반복에서 발생한 실패만 남겨 로그 폭증 없이 대표 상태 코드를 확인한다.
  if (!succeeded && __ITER === 0) {
    console.error(`[${apiName}] status=${response.status}`);
  }
}

function requestParams(apiName) {
  return {
    headers: {
      Accept: "application/json",
      Cookie: COOKIE,
    },
    redirects: 0,
    timeout: REQUEST_TIMEOUT,
    tags: { api: apiName },
  };
}

function selectJarId() {
  return JAR_IDS[(__VU + __ITER - 1) % JAR_IDS.length];
}

function randomThinkSeconds() {
  return MIN_THINK_SECONDS + Math.random() * (MAX_THINK_SECONDS - MIN_THINK_SECONDS);
}

/** Vercel의 SPA HTML 응답을 API 성공으로 오판하지 않도록 JSON 응답인지 확인한다. */
function isJsonResponse(response) {
  const contentType = response.headers["Content-Type"] || "";
  return contentType.toLowerCase().includes("application/json");
}

function positiveNumber(rawValue, fallback) {
  const parsed = Number(rawValue);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
