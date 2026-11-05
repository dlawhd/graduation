import apiClient from "./apiClient";

/** 검색 비밀키를 노출하지 않도록 기존 인증 API를 통해 서버에 검색을 맡긴다. */
export async function searchPlaces(q, signal) {
  const response = await apiClient.get("/api/v1/places/search", {
    params: { q }, signal, timeout: 9000,
  });
  return response?.data?.data || [];
}
