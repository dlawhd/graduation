import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import "../src/index.css";
import JarChatModal from "../src/features/jarDetail/components/JarChatModal";
import { StompClientProvider } from "../src/realtime/StompClientProvider";

/** 실제 채팅 모달을 API 대역과 함께 검증한다. 자동 시험에서만 활성화한다. */
function ChatFixture() {
  const [open, setOpen] = useState(true);
  return <StompClientProvider><button onClick={() => setOpen(true)}>채팅 열기</button><JarChatModal open={open} jar={{ jarId: 10, name: "우리의 작은 순간" }} currentUserId={1} onClose={() => setOpen(false)} /></StompClientProvider>;
}
if (window.__MEMORYJAR_AUDIT_TEST__ === true) createRoot(document.getElementById("root")).render(<ChatFixture />);
else document.getElementById("root").textContent = "자동 회귀 시험에서만 활성화합니다.";
