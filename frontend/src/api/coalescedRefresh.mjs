/** 짧은 시간에 몰린 알림을 한 번에 다시 읽고, 읽는 중 발생한 변경은 끝난 뒤 한 번 더 반영한다. */
export function createCoalescedRefresh(refresh, delay = 100) {
  let timer = null;
  let running = false;
  let dirty = false;
  let disposed = false;
  function request() {
    if (disposed) return;
    dirty = true;
    if (running || timer !== null) return;
    timer = setTimeout(async () => {
      timer = null;
      if (disposed) return;
      running = true;
      dirty = false;
      try { await refresh(); }
      catch { /* 개별 API 함수가 오류 상태를 표시한다. 다음 변경의 재조회는 계속 허용한다. */ }
      finally {
        running = false;
        if (dirty && !disposed) request();
      }
    }, delay);
  }
  return {
    request,
    dispose() { disposed = true; dirty = false; if (timer !== null) clearTimeout(timer); timer = null; },
  };
}
