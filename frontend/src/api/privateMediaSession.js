import apiClient from "./apiClient";
import { createMediaSessionCheck, isPrivateMediaSource } from "./privateMedia.mjs";

// img/video의 직접 요청은 Axios를 거치지 않는다. 오류 때 기존 갱신·로그아웃 정책으로 세션을 한 번 확인한다.
export const recheckMediaSession = createMediaSessionCheck(() => apiClient.get("/api/v1/me", { timeout: 10000 }));
export function isProtectedMediaSource(source) {
  return isPrivateMediaSource(source, apiClient.defaults.baseURL, window.location.origin);
}
