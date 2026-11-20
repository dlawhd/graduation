import { useEffect, useRef, useState } from "react";
import { getSupportInquiries, getSupportPermissions, supportError } from "../../api/supportApi";
import { useRequestGate } from "../../api/useRequestGate";
import { useUserStateRefresh } from "../../realtime/useUserStateRefresh";
import { canViewSupportInquiries } from "./supportView.mjs";

/** 운영 권한과 커서 목록을 관리한다. 문의 선택은 목록 재조회와 분리해 불필요한 요청을 막는다. */
export function useOperatorSupportInbox({ userId, checkingAuth }) {
  const [permission, setPermission] = useState(null);
  const [permissionError, setPermissionError] = useState("");
  const [permissionVersion, setPermissionVersion] = useState(0);
  const [status, setStatus] = useState("");
  const [cursors, setCursors] = useState([undefined]);
  const [page, setPage] = useState(0);
  const [snapshot, setSnapshot] = useState(null);
  const [pendingScope, setPendingScope] = useState(null);
  const [failure, setFailure] = useState(null);
  const [version, setVersion] = useState(0);
  const [updatedAt, setUpdatedAt] = useState(null);
  const refreshPending = useRef(false);
  const before = cursors[page];
  const scope = `${userId}:${status}:${before ?? "first"}`;
  const gate = useRequestGate(scope);
  const allowed = canViewSupportInquiries(true, userId, permission);

  useEffect(() => {
    if (!userId || checkingAuth) return;
    const controller = new AbortController();
    setPermission(null); setPermissionError("");
    getSupportPermissions({ signal: controller.signal }).then(value => {
      if (!controller.signal.aborted) setPermission({ ...value, userId });
    }).catch(error => {
      if (!controller.signal.aborted) setPermissionError(supportError(error));
    });
    return () => controller.abort();
  }, [userId, checkingAuth, permissionVersion]);

  useEffect(() => {
    if (!allowed || checkingAuth) return;
    const controller = new AbortController(), current = gate.begin("list");
    refreshPending.current = true; setPendingScope(scope); setFailure(null);
    getSupportInquiries({ operator: true, status: status || undefined, before, signal: controller.signal })
      .then(data => {
        if (!current()) return;
        setSnapshot({ scope, data }); setUpdatedAt(new Date());
      }).catch(error => {
        if (!current()) return;
        setFailure({ scope, message: supportError(error) });
        // 권한이 취소되면 목록뿐 아니라 이미 열었던 상세·첨부도 즉시 내린다.
        if ([401, 403].includes(error?.response?.status)) {
          setPermission({ userId, operator: false }); setPermissionError(supportError(error)); setSnapshot(null);
        }
      }).finally(() => {
        if (current()) { refreshPending.current = false; setPendingScope(null); }
      });
    return () => controller.abort();
  }, [allowed, checkingAuth, gate, scope, userId, status, before, version]);

  function refresh() { setVersion(value => value + 1); }
  useUserStateRefresh({ userId, scope: "operator-support-inbox", enabled: allowed && !checkingAuth,
    accepts: event => event.type === "SUPPORT_CHANGED", refresh });

  return {
    allowed, permission, permissionError, status, page, updatedAt,
    result: snapshot?.scope === scope && allowed ? snapshot.data : null,
    loading: pendingScope === scope,
    error: failure?.scope === scope ? failure.message : "",
    refresh,
    retryPermission: () => setPermissionVersion(value => value + 1),
    changeStatus(value) { setStatus(value); setCursors([undefined]); setPage(0); },
    previous() { if (!refreshPending.current && page > 0) { refreshPending.current = true; setPage(value => value - 1); } },
    next() {
      const cursor = snapshot?.scope === scope ? snapshot.data?.nextBefore : null;
      if (!cursor || refreshPending.current) return;
      refreshPending.current = true;
      setCursors(previous => [...previous.slice(0, page + 1), cursor]); setPage(value => value + 1);
    },
    revokeAccess() { setPermission({ userId, operator: false }); setSnapshot(null); },
  };
}
