import React, { useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "../src/index.css";
import apiClient from "../src/api/apiClient";
import JarZoomModal from "../src/features/jarDetail/components/JarZoomModal";
import MemoryDrawModal from "../src/features/jarDetail/components/MemoryDrawModal";
import { getThemePalette } from "../src/features/jarDetail/theme/jarDetailTheme";
import { useJarDailyDraw } from "../src/features/jarDetail/hooks/useJarDailyDraw";
import { useJarInvites } from "../src/features/jarDetail/hooks/useJarInvites";
import JarChatPanel from "../src/pages/JarChatPanel";
import { StompClientProvider, useStompClient } from "../src/realtime/StompClientProvider";

// 실제 컴포넌트를 쓰되 모든 API와 소켓은 browser.cjs가 차단·모킹하는 로컬 회귀 시험 화면이다.
const jar = { jarId: 10, name: "조회 회귀 시험", theme: "SPRING", isOpen: true, openMode: "DAILY_DRAW" };
const palette = getThemePalette("SPRING");
function Fixture() {
  const view = new URLSearchParams(location.search).get("view") || "notes";
  const [notes, setNotes] = useState([]), [pagination, setPagination] = useState({});
  const [loading, setLoading] = useState(false), [error, setError] = useState("");
  const socket = useStompClient();
  const loadNotes = useCallback(async ({ page = 0, q = "", tag = "" } = {}) => {
    setLoading(true);
    try {
      const response = await apiClient.get("/api/v1/jars/10/notes", { params: { page, size: 3, q, tag } });
      setNotes(response.data.data.items); setPagination(response.data.data);
    } finally { setLoading(false); }
  }, []);
  const history = useJarDailyDraw({ jarId: 10, jar, memoryDrawOpen: view === "history", loadJarZoomNotes: loadNotes });
  const invites = useJarInvites({ jarId: 10, jar: { ...jar, myRole: "OWNER" } });
  useEffect(() => {
    if (view === "chat") socket.start();
    return () => { socket.stop({ clearSubscriptions: true }); };
  }, [view, socket.start, socket.stop]);
  window.auditApiProbe = async () => {
    try { await apiClient.get("/api/v1/probe"); return "ok"; }
    catch (failure) { return failure.authReason || "temporary"; }
  };
  if (view === "chat") return <JarChatPanel jarId={10} currentUserId={1} />;
  if (view === "invite") return <button onClick={invites.handleCreateInvite}>초대 오류 시험</button>;
  if (view === "history") return <MemoryDrawModal open jar={jar} palette={palette} today={history.dailyDrawToday}
    history={history.dailyDrawHistory} historyPagination={history.dailyDrawHistoryPagination}
    onHistoryPageChange={(page) => history.loadDailyDrawHistory({ page })}
    loading={history.dailyDrawLoading} error={history.dailyDrawError} onClose={() => {}} />;
  return <JarZoomModal open jar={view === "locked" ? { ...jar, isOpen: false } : jar} palette={palette} notes={notes} pagination={pagination}
    loading={loading} error={error} onQueryChange={loadNotes} onClose={() => {}} />;
}
// 직접 URL을 열어도 실제 서버 요청을 보내지 않는다. 요청을 차단한 자동 시험에서만 활성화한다.
if (window.__MEMORYJAR_AUDIT_TEST__ === true) {
  createRoot(document.getElementById("root")).render(<StompClientProvider><Fixture /></StompClientProvider>);
} else {
  document.getElementById("root").textContent = "자동 회귀 테스트 전용 화면입니다. browser.cjs로 실행해 주세요.";
}
