/*
 * socketUrl.js 역할
 *
 * 이 파일은 프론트엔드에서 사용하는 WebSocket 주소를 한 곳에서 관리하는 파일
 */

const LOCAL_WS_URL = "ws://localhost:8080/ws";
const PROD_WS_URL = "wss://api.esjh.shop/ws";

export function getWebSocketUrl() {
  /*
   * VITE_WS_BASE_URL이 있으면 그 값을 가장 먼저 사용한다.
   *
   * 예:
   * - 로컬: ws://localhost:8080/ws
   * - 배포: wss://api.esjh.shop/ws
   * - 테스트 서버: wss://test-api.esjh.shop/ws
   */
  const envWebSocketUrl = import.meta.env.VITE_WS_BASE_URL;

  if (envWebSocketUrl) {
    return envWebSocketUrl;
  }

  /*
   * 환경 변수가 없을 때도 로컬 개발은 바로 동작하게 한다.
   */
  const isLocal =
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1";

  if (isLocal) {
    return LOCAL_WS_URL;
  }

  /*
   * 배포 환경에서 환경 변수 설정을 깜빡해도
   * 기존 배포 주소로 연결되도록 안전장치를 둔다.
   */
  return PROD_WS_URL;
}