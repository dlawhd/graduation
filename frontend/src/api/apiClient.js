// src/api/apiClient.js
import axios from "axios";
import { notifyOperatorMfaRequired } from "./operatorMfaEvents.mjs";
import { refreshSharedSession } from "./authRefreshCoordination.mjs";
import { recordSupportFailure, clearSupportFailure } from "../features/support/supportContext.mjs";
import {
  markSessionExpiredError,
  notifySessionExpired,
} from "./authSessionUtils";
const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  withCredentials: true,
});

// CSRF 토큰을 메모리에 저장
let csrfHeaderName = "X-XSRF-TOKEN";
let csrfToken = "";

// refresh 요청이 여러 번 동시에 나가지 않게 막는 변수
// 예: API 5개가 동시에 401이 나도 refresh는 1번만 실행되게 함
let refreshPromise = null;
let refreshController = null;
let authEpoch = 0;
let changingAuth = false;

// 여러 탭의 로그인 경계도 맞춘다. 비밀 쿠키나 사용자 정보 대신 변경 신호만 전달한다.
const authChannel = typeof window !== "undefined" && typeof BroadcastChannel === "function"
  ? new BroadcastChannel("memoryjar-auth-boundary") : null;
if (authChannel) authChannel.onmessage = event => {
  if (event.data !== "changed") return;
  authEpoch += 1;
  csrfToken = "";
  refreshController?.abort(); refreshPromise = null;
  clearSupportFailure();
  notifySessionExpired();
};

/** 로그아웃 시작 즉시 이전 요청의 재시도를 차단한다. 서버의 로그인 묶음 폐기가 보안 경계다. */
export function beginAuthChange() {
  clearSupportFailure();
  authEpoch += 1;
  changingAuth = true;
  authChannel?.postMessage("changed");
  refreshController?.abort();
  refreshPromise = null;
}

export function finishAuthChange() {
  changingAuth = false;
}

function staleRequest(config) {
  return config?._authEpoch !== undefined && config._authEpoch !== authEpoch;
}

function authChangedError() {
  return new axios.CanceledError("로그인 상태가 바뀌어 이전 요청을 취소했습니다.");
}

// CSRF 토큰 먼저 받아오기
export async function fetchCsrf() {
  const res = await apiClient.get("/api/v1/csrf");

  // 응답 구조: { data: { headerName, token, ... } }
  const csrfData = res.data?.data;

  csrfHeaderName = csrfData?.headerName || "X-XSRF-TOKEN";
  csrfToken = csrfData?.token || "";

  return csrfToken;
}

// CSRF 토큰이 없으면 새로 받아오는 함수
export async function ensureCsrf() {
  if (!csrfToken) {
    await fetchCsrf();
  }
  return csrfToken;
}

/** 로그아웃 뒤 다음 사용자가 이전 세션의 CSRF 토큰을 재사용하지 않도록 메모리 값을 비운다. */
export function clearCsrf() {
  csrfToken = "";
}

// POST/PUT/PATCH/DELETE 요청에는 CSRF 헤더 자동 첨부
apiClient.interceptors.request.use((config) => {
  if (typeof window !== "undefined" && config._supportPath===undefined) config._supportPath=window.location.pathname;
  if (staleRequest(config)) throw authChangedError();
  config._authEpoch = authEpoch;
  const method = (config.method || "get").toLowerCase();
  const unsafeMethods = ["post", "put", "patch", "delete"];

  if (unsafeMethods.includes(method) && csrfToken) {
    config.headers = config.headers || {};
    config.headers[csrfHeaderName] = csrfToken;
  }

  return config;
});

// 401이 오면 refresh 후 원래 요청을 한 번 다시 시도
apiClient.interceptors.response.use(
  // 성공 응답은 그대로 반환
  (response) => {
    if (staleRequest(response.config)) throw authChangedError();
    if (/\/api\/v1\/auth\/(login|signup|logout|password-reset)$/.test(response.config.url || "")) {
      clearSupportFailure();
      authEpoch += 1;
      authChannel?.postMessage("changed");
      csrfToken = "";
      refreshController?.abort();
      refreshPromise = null;
    }
    return response;
  },

  // 실패 응답 처리
  async (error) => {
    const originalRequest = error.config;
    const status = error.response?.status;
    const requestUrl = originalRequest?.url || "";

    // 요청 정보가 없으면 그대로 에러 반환
    if (!originalRequest) {
      return Promise.reject(error);
    }
    if (staleRequest(originalRequest)) return Promise.reject(authChangedError());
    notifyOperatorMfaRequired(error);
    if (typeof window !== "undefined" && originalRequest._supportPath===window.location.pathname) recordSupportFailure(error,window.location);

    // 이 요청은 401이 나도 refresh를 시도하지 않기로 표시된 요청이면 그대로 에러 반환
    if (originalRequest._skipAuthRefresh) {
      return Promise.reject(error);
    }

    // refresh/csrf/logout 요청 자체가 실패한 경우에는 다시 refresh를 시도하지 않음
    // 이걸 막지 않으면 무한 반복될 수 있음
    const isAuthRequest =
      requestUrl.includes("/api/v1/auth/refresh") ||
      requestUrl.includes("/api/v1/auth/logout") ||
      requestUrl.includes("/api/v1/csrf");

    if (isAuthRequest) {
      return Promise.reject(error);
    }

    // 401이 아니면 refresh 대상이 아니므로 그대로 에러 반환
    if (status !== 401) {
      return Promise.reject(error);
    }
    if (changingAuth) return Promise.reject(authChangedError());

    // 이미 한 번 재시도한 요청이면 또 재시도하지 않음
    // refreshToken까지 만료된 상황에서 무한 반복되는 것을 막기 위함
    if (originalRequest._retry) {
      return Promise.reject(error);
    }

    originalRequest._retry = true;

    try {
      if (changingAuth || staleRequest(originalRequest)) throw authChangedError();

      // 여러 API가 동시에 401을 받아도 refresh는 한 번만 보내기
      if (!refreshPromise) {
        const controller = new AbortController();
        refreshController = controller;
        const pending = refreshSharedSession({
          signal: controller.signal,
          probe: async () => {
            if (changingAuth || staleRequest(originalRequest)) throw authChangedError();
            try {
              await apiClient.get("/api/v1/me", { _skipAuthRefresh: true, signal: controller.signal });
              return true;
            } catch (failure) {
              if (failure?.response?.status === 401) return false;
              throw failure;
            }
          },
          refresh: async () => {
            // 탭 간 대기 뒤에는 현재 세션의 CSRF를 다시 읽는다. 서버의 토큰 재사용 방어는 유지한다.
            await fetchCsrf();
            if (changingAuth || staleRequest(originalRequest)) throw authChangedError();
            await apiClient.post("/api/v1/auth/refresh", null, { signal: controller.signal });
          },
        })
          .finally(() => {
            if (refreshPromise === pending) {
              refreshPromise = null;
              refreshController = null;
            }
          });
        refreshPromise = pending;
      }

      // refresh가 끝날 때까지 기다림
      await refreshPromise;
      if (changingAuth || staleRequest(originalRequest)) throw authChangedError();

      // refresh 성공 후 새 accessToken 쿠키가 저장되었으므로
      // 원래 실패했던 요청을 다시 보냄
      return apiClient(originalRequest);
    } catch (refreshError) {
      if (changingAuth || staleRequest(originalRequest)) return Promise.reject(authChangedError());
      // 네트워크/5xx/CSRF 오류는 세션 폐기의 증거가 아니다. 입력과 로그인 상태를 보존한다.
      if (refreshError?.response?.status !== 401) {
        return Promise.reject(refreshError);
      }
      /*
       * Access Token 재발급까지 실패했다는 것은
       * Refresh Token도 사용할 수 없다는 의미다.
       *
       * 다음 로그인에서는 새로운 CSRF 토큰을 받아야 하므로
       * 메모리에 남아 있던 기존 토큰도 비운다.
       */
      csrfToken = "";
      authEpoch += 1;
      clearSupportFailure();

      /*
       * App에 로그인 만료 사실을 전달해서
       * 헤더에 남아 있는 사용자 정보와 패널을 정리한다.
       */
      notifySessionExpired();

      /*
       * 각 페이지가 일반 서버 오류와 구분할 수 있도록
       * 오류 객체에 SESSION_EXPIRED 표시를 추가한다.
       */
      return Promise.reject(
        markSessionExpiredError(
          refreshError
        )
      );
    }
  }
);

export default apiClient;
