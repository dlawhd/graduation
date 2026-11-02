import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, useNavigate } from "react-router-dom";
import axios from "axios";
import apiClient from "../src/api/apiClient";
import JarDesignNewPage from "../src/pages/JarDesignNewPage";
import { useJarDailyDraw } from "../src/features/jarDetail/hooks/useJarDailyDraw";
import { StompClientProvider } from "../src/realtime/StompClientProvider";
import "../src/index.css";

// 실제 화면과 Hook을 사용하되, 모든 API는 응답 순서를 제어하는 대역으로 바꾼다.
const pending = [];
window.fixture = {
  pending: () => pending.map(({url, method}, index) => ({url, method, index})),
  respond: (index, data, status = 200) => pending[index].respond(data, status),
  zoomCalls: 0,
};
apiClient.defaults.adapter = config => {
  const result = (data, status = 200) => ({config, status, statusText: "fixture", headers: {}, data: {data}});
  if (config.url.endsWith("/csrf")) return Promise.resolve(result({token: "fixture", headerName: "X-XSRF-TOKEN"}));
  if (config.url.endsWith("/history") && !window.fixture.deferHistory) return Promise.resolve(result({items: [], page: 0, totalPages: 0}));
  return new Promise((resolve, reject) => pending.push({url: config.url, method: config.method,
    respond(data, status) {
      if (status >= 400) reject(new axios.AxiosError("지연된 시험 오류", "ERR_BAD_RESPONSE", config, null, result(data, status)));
      else resolve(result(data));
    },
  }));
};
const zoom = async () => { window.fixture.zoomCalls += 1; };
function DrawFixture() {
  const [jarId, setJarId] = useState(1);
  const [jar, setJar] = useState({isOpen: true});
  const draw = useJarDailyDraw({jarId, jar, memoryDrawOpen: false, loadJarZoomNotes: zoom});
  window.fixture.today = options => draw.loadDailyDrawToday(options);
  window.fixture.refresh = () => draw.refreshDailyDraw();
  window.fixture.draw = () => draw.handleDrawDailyDrawToday();
  window.fixture.changeJar = setJarId;
  window.fixture.closeJar = () => setJar({isOpen: false});
  return <pre id="snapshot">{JSON.stringify({jarId, today: draw.dailyDrawToday, error: draw.dailyDrawError,
    loading: draw.dailyDrawLoading, drawing: draw.dailyDrawDrawing})}</pre>;
}
function CreationFixture() {
  const navigate = useNavigate();
  useEffect(() => { window.fixture.navigate = navigate; }, [navigate]);
  return <Routes><Route path="/jars/new" element={<p>제작 화면을 떠났어요</p>}/>
    <Route path="*" element={<JarDesignNewPage/>}/></Routes>;
}
createRoot(document.getElementById("root")).render(new URLSearchParams(location.search).get("fixture") === "draw"
  ? <DrawFixture/> : <BrowserRouter><StompClientProvider><CreationFixture/></StompClientProvider></BrowserRouter>);
