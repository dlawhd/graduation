import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, useNavigate } from "react-router-dom";
import axios from "axios";
import apiClient, { beginAuthChange, finishAuthChange } from "../src/api/apiClient";
import { useJarDetail } from "../src/features/jarDetail/hooks/useJarDetail";
import { useJarMembers } from "../src/features/jarDetail/hooks/useJarMembers";
import { useJarInvites } from "../src/features/jarDetail/hooks/useJarInvites";
import { StompClientProvider } from "../src/realtime/StompClientProvider";
import App from "../src/App";
import "../src/index.css";

// 실제 HTTP·쿠키·계정은 사용하지 않는다. 외부 요청 대신 테스트가 응답 순서와 오류를 결정한다.
const mode = new URLSearchParams(location.search).get("mode") || "hooks";
const requests = [];
window.activeAccount = 1;
apiClient.defaults.adapter = config => {
  const result = data => ({ config, status: 200, statusText: "OK", headers: {}, data: { data } });
  if (config.url === "/api/v1/csrf") return Promise.resolve(result({ token: "fixture-csrf", headerName: "X-XSRF-TOKEN" }));
  if (mode === "app") {
    if (config.url === "/api/v1/me") return Promise.resolve(result({ userId: window.activeAccount, name: `계정${window.activeAccount}` }));
    if (!config.url.startsWith("/api/v1/notifications")) return Promise.resolve(result({ items: [], status: "COMPLETED" }));
  }
  return new Promise((resolve, reject) => {
    requests.push({ url: config.url, epoch: config._authEpoch, method: config.method, data: config.data,
      respond(data, status = 200) {
        if (status >= 400) reject(new axios.AxiosError("시험 오류", "ERR_BAD_RESPONSE", config, null,
          { ...result(data), status }));
        else resolve(result(data));
      },
    });
  });
};
window.race = {
  pending: () => requests.map(({ url, method, data }, index) => ({ index, url, method, data })),
  respond: (index, data, status) => requests[index].respond(data, status),
  request: url => apiClient.get(url), beginAuthChange, finishAuthChange, apiClient,
};

function Hooks() {
  const [id, setId] = useState("1");
  const detail = useJarDetail(id);
  const jar = useMemo(() => ({ jarId: Number(id), myRole: "OWNER" }), [id]);
  const members = useJarMembers({ jarId: id, jar, navigate: () => {}, loadJarDetail: detail.loadJarDetail });
  const invites = useJarInvites({ jarId: id, jar });
  useEffect(() => {
    window.race.switchJar = setId;
    window.race.reload = () => { detail.loadJarDetail(); members.loadMembers(); invites.loadInvites(); };
  });
  return <pre id="snapshot">{JSON.stringify({ id, jar: detail.jar, members: members.members, invites: invites.invites,
    loading: detail.loading || members.membersLoading || invites.invitesLoading,
    errors: [detail.error, members.membersError, invites.invitesError] })}</pre>;
}

function AppFixture() {
  const navigate = useNavigate();
  useEffect(() => { window.race.navigate = navigate; }, [navigate]);
  return <StompClientProvider><App /></StompClientProvider>;
}

createRoot(document.getElementById("root")).render(
  mode === "hooks" ? <Hooks /> : mode === "app" ? <BrowserRouter><AppFixture /></BrowserRouter> : <p>인증 요청 시험 준비</p>
);
