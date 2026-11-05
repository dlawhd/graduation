import { useEffect, useLayoutEffect, useRef } from "react";
import { useStompClient } from "./StompClientProvider";
import { subscribeUserStateSocket } from "../api/userStateSocketApi";
import { createCoalescedRefresh } from "../api/coalescedRefresh.mjs";

/** 한 연결을 재사용하고 몰린 변경을 합친다. 재접속·탭 복귀 때 놓친 상태도 확인하며 화면 이탈 시 예약을 취소한다. */
export function useUserStateRefresh({ userId, scope, enabled = true, accepts, refresh, onEvent }) {
  const { subscribe, connected } = useStompClient();
  const latest = useRef(null);
  const queued = useRef(null);
  const wasConnected = useRef(connected);

  // 계정·화면이 바뀐 렌더에서 이전 구독이 새 화면의 함수를 실행하지 못하게 한다.
  useLayoutEffect(() => {
    latest.current = { userId, scope, enabled, connected, accepts, refresh, onEvent };
  });

  useEffect(() => {
    if (!userId || !enabled) return;
    let active = true;
    const current = () => active && latest.current?.enabled &&
      latest.current.userId === userId && latest.current.scope === scope;
    const queue = createCoalescedRefresh(() => current() ? latest.current.refresh() : undefined, 150);
    queued.current = queue;
    const unsubscribe = subscribeUserStateSocket({
      subscribe, userId,
      onChanged: event => {
        if (!current() || latest.current.accepts?.(event) === false) return;
        latest.current.onEvent?.(event);
        queue.request();
      },
    });
    // 이미 연결된 채 화면에 들어오면 최초 조회와 구독 사이에 놓친 변경도 한 번 맞춘다.
    if (latest.current.connected) queue.request();
    const returning = () => { if (document.visibilityState === "visible") queue.request(); };
    window.addEventListener("focus", returning);
    document.addEventListener("visibilitychange", returning);
    return () => {
      active = false;
      unsubscribe();
      queue.dispose();
      if (queued.current === queue) queued.current = null;
      window.removeEventListener("focus", returning);
      document.removeEventListener("visibilitychange", returning);
    };
  }, [userId, scope, enabled, subscribe]);

  useEffect(() => {
    if (connected && !wasConnected.current) queued.current?.request();
    wasConnected.current = connected;
  }, [connected]);
}
