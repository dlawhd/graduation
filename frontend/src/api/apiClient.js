// src/api/apiClient.js
import axios from "axios";

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  withCredentials: true,
});

// ✅ CSRF 토큰을 메모리에 저장
let csrfHeaderName = "X-XSRF-TOKEN";
let csrfToken = "";

// ✅ CSRF 토큰 먼저 받아오기
export async function fetchCsrf() {
  const res = await apiClient.get("/api/v1/csrf");

    // ✅ 이제 응답이 { data: { headerName, token, ... } } 구조라서
    //    바깥 data 안의 진짜 data를 한 번 더 꺼내야 함
    const csrfData = res.data?.data;
    csrfHeaderName = csrfData?.headerName || "X-XSRF-TOKEN";
    csrfToken = csrfData?.token || "";
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