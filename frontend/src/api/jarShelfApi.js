import apiClient, { ensureCsrf } from "./apiClient";

/** 보관함의 개인 설정을 서버에 저장한다. 최종 값을 보내므로 재시도해도 토글되지 않는다. */
export async function setJarFavorite(jarId, favorite) {
  await ensureCsrf();
  await apiClient.patch(`/api/v1/jars/${jarId}/favorite`, { favorite });
}
