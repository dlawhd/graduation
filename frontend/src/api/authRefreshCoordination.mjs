/** 같은 출처의 여러 탭도 한 번씩 갱신한다. 쿠키·토큰 원문을 탭 간에 공유하거나 저장하지 않는다. */
export async function refreshSharedSession({ probe, refresh, signal, locks = globalThis.navigator?.locks }) {
  const run = async () => {
    if (signal?.aborted) throw new DOMException("로그인 변경으로 취소했습니다.", "AbortError");
    // 잠금을 기다리는 동안 다른 탭이 쿠키를 갱신했으면 회전 대신 원래 요청을 재시도한다.
    if (await probe()) return;
    try { await refresh(); }
    catch (error) {
      // Web Locks 미지원 환경에서도 다른 탭의 성공을 확인한 뒤에만 만료로 판단한다.
      if (error?.response?.status === 401 && await probe()) return;
      throw error;
    }
  };
  return locks?.request
    ? locks.request("memoryjar-auth-refresh", { signal }, run)
    : run();
}
