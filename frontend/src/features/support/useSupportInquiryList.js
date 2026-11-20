import { useEffect, useRef, useState } from "react";
import { getSupportInquiries, supportError } from "../../api/supportApi";
import { useRequestGate } from "../../api/useRequestGate";
import { useUserStateRefresh } from "../../realtime/useUserStateRefresh";

/** 사용자/게스트 목록의 커서와 재시도를 관리한다. 게스트는 실시간 구독 없이 명시적으로 조회한다. */
export function useSupportInquiryList({ userId, guest = false, enabled, sessionVersion = 0, onDenied }) {
  const [cursors, setCursors] = useState([undefined]), [page, setPage] = useState(0);
  const [version, setVersion] = useState(0), [snapshot, setSnapshot] = useState(null);
  const [pendingScope, setPendingScope] = useState(null), [failure, setFailure] = useState(null);
  const pending = useRef(false), deniedCallback = useRef(onDenied);
  deniedCallback.current = onDenied;
  const before = cursors[page], scope = `${guest ? "guest" : userId}:${sessionVersion}:${before ?? "first"}`;
  const gate = useRequestGate(scope);
  useEffect(() => {
    if (!enabled) { pending.current = false; setSnapshot(null); setFailure(null); setPendingScope(null); return; }
    const controller = new AbortController(), current = gate.begin("list");
    pending.current = true; setPendingScope(scope); setFailure(null);
    getSupportInquiries({ guest, before, signal: controller.signal }).then(data => {
      if (current() && !controller.signal.aborted) setSnapshot({ scope, data });
    }).catch(error => {
      if (!current() || controller.signal.aborted) return;
      setFailure({ scope, message: supportError(error) });
      if ([401, 403, 410].includes(error?.response?.status)) { setSnapshot(null); deniedCallback.current?.(); }
    }).finally(() => { if (current() && !controller.signal.aborted) { pending.current = false; setPendingScope(null); } });
    return () => controller.abort();
  }, [enabled, guest, before, gate, scope, version]);
  function refresh() { setVersion(value => value + 1); }
  useUserStateRefresh({ userId, scope: "user-support-list", enabled: enabled && !guest,
    accepts: event => event.type === "SUPPORT_CHANGED", refresh });
  return {
    result: enabled && snapshot?.scope === scope ? snapshot.data : null,
    error: enabled && failure?.scope === scope ? failure.message : "",
    loading: enabled && pendingScope === scope, page, refresh,
    reset() { setCursors([undefined]); setPage(0); },
    previous() { if (pending.current || page === 0) return; pending.current = true; setPage(value => value - 1); },
    next() {
      const cursor = snapshot?.scope === scope && snapshot.data?.nextBefore;
      if (pending.current || !cursor) return;
      pending.current = true; setCursors(previous => [...previous.slice(0, page + 1), cursor]); setPage(value => value + 1);
    },
  };
}
