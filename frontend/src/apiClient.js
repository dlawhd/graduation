// src/apiClient.js
import axios from "axios";

// ✅ axios 인스턴스
const apiClient = axios.create({
  baseURL: process.env.REACT_APP_API_BASE_URL, // ex) https://api.esjh.shop
  withCredentials: true,
});

// ✅ CSRF 토큰을 메모리에 저장(프론트 도메인에서 api 쿠키를 직접 읽기 어려워서 이 방식이 안정적)
let csrfHeaderName = "X-XSRF-TOKEN";
let csrfToken = "";

// ✅ CSRF 토큰 받기 (가장 먼저 한 번 호출)
export async function fetchCsrf() {
  const res = await apiClient.get("/api/csrf");
  // res.data = { headerName, parameterName, token }
  csrfHeaderName = res.data?.headerName || "X-XSRF-TOKEN";
  csrfToken = res.data?.token || "";
  return csrfToken;
}

// ✅ POST/PUT/PATCH/DELETE 요청에 CSRF 헤더 자동첨부
apiClient.interceptors.request.use((config) => {
  const method = (config.method || "get").toLowerCase();
  const unsafe = ["post", "put", "patch", "delete"].includes(method);

  if (unsafe && csrfToken) {
    config.headers = config.headers || {};
    config.headers[csrfHeaderName] = csrfToken;
  }
  return config;
});

export default apiClient;