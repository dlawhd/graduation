import React, { Profiler, useState } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import "../src/index.css";
import JarDetailPage from "../src/pages/JarDetailPage";
import NoteSection from "../src/pages/NoteSection";
import JarVisual from "../src/features/jarDetail/components/JarVisual";
import { StompClientProvider } from "../src/realtime/StompClientProvider";
import { OnboardingContext } from "../src/features/onboarding/OnboardingProvider";
import { getThemePalette } from "../src/features/jarDetail/theme/jarDetailTheme";

/** 실제 화면 컴포넌트를 API·소켓 차단 상태에서 검증하는 전용 화면이다. 직접 방문하면 실행하지 않는다. */
const jar = { jarId: 10, name: "시험 저금통", theme: "SPRING", isOpen: true, myRole: "OWNER", maxMembers: 2,
  memberCount: 1, noteCount: 1, openAt: "2026-10-04T10:00:00+09:00", openMode: "ALL_AT_ONCE", lockLevel: "TITLE_ONLY" };
const onboarding = { activeTutorialKey: null, savingTutorialKey: null, error: "", shouldShowTutorial: () => false,
  isTutorialHandled: () => true, openTutorial() {}, closeTutorial() {}, completeActiveTutorial() {}, skipActiveTutorial() {} };
const pixels = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="480" height="480"><rect width="480" height="480" fill="pink"/></svg>');
function VisualFixture() {
  const [custom, setCustom] = useState(true);
  window.writeAuditFrames = window.writeAuditFrames || {};
  return <><button onClick={() => setCustom(value => !value)}>외형 전환</button>
    <Profiler id="visual" onRender={() => { window.writeAuditFrames.visual = (window.writeAuditFrames.visual || 0) + 1; }}>
      <JarVisual interactive jar={custom ? { ...jar, design: { imageUrl: pixels, slotX: .5, slotY: .2, slotSizeRatio: .5 } } : jar} />
    </Profiler></>;
}
if (window.__MEMORYJAR_AUDIT_TEST__ === true) {
  const view = new URLSearchParams(location.search).get("view");
  const focus = Number(new URLSearchParams(location.search).get("focus")) || null;
  createRoot(document.getElementById("root")).render(<MemoryRouter initialEntries={[{ pathname: "/jars/10",
    state: { fromNotification: true, focusNoteId: 1, focusCommentId: focus } }]}>
    <StompClientProvider><OnboardingContext.Provider value={onboarding}>
      {view === "visual" ? <VisualFixture /> : view === "composer" ?
        <NoteSection jar={jar} palette={getThemePalette("SPRING")} formatDate={String} createRequestId={1} /> :
        <Routes><Route path="/jars/:jarId" element={<JarDetailPage />} /></Routes>}
    </OnboardingContext.Provider></StompClientProvider>
  </MemoryRouter>);
} else document.getElementById("root").textContent = "자동 회귀 시험에서만 활성화합니다.";
