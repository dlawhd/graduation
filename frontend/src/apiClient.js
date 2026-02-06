import axios from "axios";

const apiClient = axios.create({
  baseURL: "http://localhost:8080",
  withCredentials: true, // ✅ 쿠키 같이 보내기
});

export default apiClient;
