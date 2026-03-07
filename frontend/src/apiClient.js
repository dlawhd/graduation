// src/apiClient.js
import axios from "axios";

const apiClient = axios.create({
  baseURL: process.env.REACT_APP_API_BASE_URL,
  withCredentials: true,
});

// ✅ CSRF 토큰을 메모리에 저장
let csrfHeaderName = "X-XSRF-TOKEN";
let csrfToken = "";

// ✅ CSRF 토큰 먼저 받아오기
export async function fetchCsrf() {
  const res = await apiClient.get("/api/csrf");
  csrfHeaderName = res.data?.headerName || "X-XSRF-TOKEN";
  csrfToken = res.data?.token || "";
  return csrfToken;
}

// ✅ POST/PUT/PATCH/DELETE 요청에는 CSRF 헤더 자동 첨부
apiClient.interceptors.request.use((config) => {
  const method = (config.method || "get").toLowerCase();
  const unsafeMethods = ["post", "put", "patch", "delete"];

  if (unsafeMethods.includes(method) && csrfToken) {
    config.headers = config.headers || {};
    config.headers[csrfHeaderName] = csrfToken;
  }

  return config;
});

export default apiClient;