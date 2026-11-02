import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, useNavigate } from "react-router-dom";
import axios from "axios";
import App from "../src/App";
import apiClient, { beginAuthChange, finishAuthChange } from "../src/api/apiClient";
import { StompClientProvider } from "../src/realtime/StompClientProvider";
import { OnboardingProvider } from "../src/features/onboarding/OnboardingProvider";
import useOnboarding from "../src/features/onboarding/hooks/useOnboarding";
import "../src/index.css";

// 실제 API·쿠키 대신 응답 순서만 제어한다. 서비스 데이터나 외부 연결은 사용하지 않는다.
const mode = new URLSearchParams(location.search).get("mode");
const pending = [];
window.fixture = { account: 1, pending: () => pending.map(({url, method, params}, index) => ({index, url, method, params})),
  respond(index, data, status = 200) { pending[index].respond(data, status); },
  authChange() { beginAuthChange(); finishAuthChange(); },
};
apiClient.defaults.adapter = config => {
  const result = data => ({config, status: 200, statusText: "OK", headers: {}, data: {data}});
  const url = config.url;
  if (url.endsWith("/csrf")) return Promise.resolve(result({token: "fixture", headerName: "X-XSRF-TOKEN"}));
  if (mode === "shelf") {
    if (url === "/api/v1/me") return Promise.resolve(result({userId: window.fixture.account, name: "계정" + window.fixture.account}));
    if (url === "/api/v1/me/onboarding") return Promise.resolve(result({version: 1, items: ["WELCOME", "JAR_LIST", "JAR_CREATE", "JAR_DETAIL", "JAR_INVITE", "DAILY_DRAW"].map(tutorialKey => ({tutorialKey, handled: true, status: "COMPLETED"}))}));
    if (url === "/api/v1/jars" && config.params?.size === 3) return Promise.resolve(result({items: []}));
    if (url !== "/api/v1/jars") return Promise.resolve(result({items: [], unreadCount: 0}));
  }
  return new Promise((resolve, reject) => pending.push({url, method: config.method, params: config.params,
    respond(data, status) {
      if (status >= 400) reject(new axios.AxiosError("이전 요청 오류", "ERR_BAD_RESPONSE", config, null, {...result(data), status}));
      else resolve(result(data));
    },
  }));
};
function ActualApp() {
  const navigate = useNavigate();
  useEffect(() => { window.fixture.navigate = navigate; }, [navigate]);
  return <StompClientProvider><App /></StompClientProvider>;
}
function TutorialState({ userId }) {
  const flow = useOnboarding();
  window.fixture.finish = () => flow.finishTutorial("WELCOME", "COMPLETED").catch(e => { window.fixture.oldError = e.code; });
  window.fixture.refresh = () => flow.refreshProgress().catch(e => { window.fixture.oldRefreshError = e.code; });
  return <pre id="snapshot">{JSON.stringify({userId, error: flow.error, saving: flow.savingTutorialKey,
    handled: flow.progressByKey.WELCOME?.handled, ready: flow.isReady})}</pre>;
}
function TutorialFixture() {
  const [userId, setUserId] = useState(1);
  window.fixture.switchUser = id => { window.fixture.authChange(); setUserId(id); };
  return <OnboardingProvider userId={userId} checkingAuth={false}><TutorialState userId={userId}/></OnboardingProvider>;
}
createRoot(document.getElementById("root")).render(mode === "shelf"
  ? <BrowserRouter><ActualApp /></BrowserRouter> : <TutorialFixture />);
