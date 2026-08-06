// src/api/apiClient.js
import axios from "axios";
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
async function ensureCsrf() {
  if (!csrfToken) {
    await fetchCsrf();
  }
}

// POST/PUT/PATCH/DELETE 요청에는 CSRF 헤더 자동 첨부
apiClient.interceptors.request.use((config) => {
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
  (response) => response,

  // 실패 응답 처리
  async (error) => {
    const originalRequest = error.config;
    const status = error.response?.status;
    const requestUrl = originalRequest?.url || "";

    // 요청 정보가 없으면 그대로 에러 반환
    if (!originalRequest) {
      return Promise.reject(error);
    }

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

    // 이미 한 번 재시도한 요청이면 또 재시도하지 않음
    // refreshToken까지 만료된 상황에서 무한 반복되는 것을 막기 위함
    if (originalRequest._retry) {
      return Promise.reject(error);
    }

    originalRequest._retry = true;

    try {
      // refresh는 POST 요청이라 CSRF 토큰이 필요할 수 있음
      await ensureCsrf();

      // 여러 API가 동시에 401을 받아도 refresh는 한 번만 보내기
      if (!refreshPromise) {
        refreshPromise = apiClient
          .post("/api/v1/auth/refresh")
          .finally(() => {
            refreshPromise = null;
          });
      }

      // refresh가 끝날 때까지 기다림
      await refreshPromise;

      // refresh 성공 후 새 accessToken 쿠키가 저장되었으므로
      // 원래 실패했던 요청을 다시 보냄
      return apiClient(originalRequest);
    } catch (refreshError) {
      /*
       * Access Token 재발급까지 실패했다는 것은
       * Refresh Token도 사용할 수 없다는 의미다.
       *
       * 다음 로그인에서는 새로운 CSRF 토큰을 받아야 하므로
       * 메모리에 남아 있던 기존 토큰도 비운다.
       */
      csrfToken = "";

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