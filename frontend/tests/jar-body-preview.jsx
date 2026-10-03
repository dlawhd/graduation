import React from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes, Link } from "react-router-dom";
import "../src/index.css";
import JarDesignNewPage from "../src/pages/JarDesignNewPage";
import JarCustomDesignVisual from "../src/features/jarDetail/components/JarCustomDesignVisual";
import { StompClientProvider } from "../src/realtime/StompClientProvider";
import apiClient from "../src/api/apiClient";
import { JAR_BODIES } from "../src/features/jarDesign/jarBodies.mjs";

// Vite의 기본 index.html 빌드에 포함되지 않는 로컬 UI 검증용 진입점이다.
// 모든 HTTP 요청은 이 메모리 어댑터에서 종료되며 WebSocket 연결을 시작하지 않는다.
if (!import.meta.env.DEV) throw new Error("로컬 개발 전용 화면입니다.");
const sample = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="480" height="480" viewBox="0 0 480 480"><rect width="480" height="480" fill="#fffaf3"/><path d="M242 380V203M242 315Q140 220 156 312Q182 350 242 343M242 286Q335 189 328 278Q298 321 242 317" fill="#85b59b" stroke="#477b5c" stroke-width="8"/><g fill="#ebafbf" stroke="#cc7b93" stroke-width="5"><ellipse cx="240" cy="153" rx="39" ry="67"/><ellipse cx="240" cy="153" rx="39" ry="67" transform="rotate(72 240 202)"/><ellipse cx="240" cy="153" rx="39" ry="67" transform="rotate(144 240 202)"/><ellipse cx="240" cy="153" rx="39" ry="67" transform="rotate(216 240 202)"/><ellipse cx="240" cy="153" rx="39" ry="67" transform="rotate(288 240 202)"/></g><circle cx="240" cy="202" r="35" fill="#edc76a"/></svg>');
let draft = { draftId: 999, status: "ACTIVE", bodyStyle: "CAT", selectedDesignType: null, generations: [{ generationId: 1, style: "WATERCOLOR", status: "SUCCEEDED" }], cutoutRegions: [] };
let finalForm = {};
apiClient.defaults.adapter = async (config) => {
  let data = {};
  const url = config.url, method = config.method;
  const input = typeof config.data === "string" ? JSON.parse(config.data) : config.data;
  if (url.endsWith("/csrf")) data = { token: "local-fixture", headerName: "X-XSRF-TOKEN" };
  else if (url === "/api/v1/design-drafts" && method === "post") { draft = { ...draft, bodyStyle: input.get("bodyStyle") }; data = { draftId: 999 }; }
  else if (url.endsWith("/preview")) data = { previewUrl: sample };
  else if (url.endsWith("/selection")) { draft = { ...draft, selectedDesignType: input.designType, selectedGenerationId: input.generationId, slotCenterX: null, slotCenterY: null, slotSizeRatio: null }; }
  else if (url.endsWith("/slot")) draft = { ...draft, slotCenterX: input.centerX, slotCenterY: input.centerY, slotSizeRatio: input.sizeRatio, slotStyle: input.slotStyle };
  else if (url.endsWith("/cutout")) draft = { ...draft, cutoutRegions: input.regions || [] };
  else if (url.endsWith("/generations")) draft = { ...draft, generations: [...draft.generations, { generationId: draft.generations.length + 1, style: input.style, status: "SUCCEEDED" }] };
  else if (url.endsWith("/finalize")) { finalForm = input; data = { jarId: 999 }; }
  else if (url === "/api/v1/design-drafts/999") data = { ...draft };
  else throw new Error(`검증하지 않은 요청 차단: ${method} ${url}`);
  return { data: { data }, status: 200, statusText: "OK", headers: {}, config };
};
function Result() { return <main className="mx-auto max-w-lg p-6"><h1 className="text-2xl font-bold">로컬 생성 완료 · {finalForm.name}</h1><JarCustomDesignVisual design={{ ...draft, imageUrl: sample }}/><p>저장한 본체: {draft.bodyStyle}</p></main>; }
function ContactSheet() { return <main className="p-6"><h1 className="mb-5 text-2xl font-black">30가지 저금통 · 같은 그림 합성 검증</h1><div className="grid grid-cols-2 gap-3 md:grid-cols-5">{JAR_BODIES.map((body) => <div key={body.id} className="rounded-2xl bg-white p-3"><JarCustomDesignVisual design={{ bodyStyle: body.id, imageUrl: sample, slotCenterX: body.slot.centerX, slotCenterY: body.slot.centerY, slotSizeRatio: body.slot.sizeRatio, slotStyle: "CAPSULE" }}/><p className="text-center text-sm font-bold">{body.name}</p></div>)}</div></main>; }
const previewRoot = import.meta.hot?.data.root || createRoot(document.getElementById("root"));
if (import.meta.hot) import.meta.hot.data.root = previewRoot;
previewRoot.render(<MemoryRouter><StompClientProvider><header className="flex flex-wrap justify-between gap-3 bg-white px-6 py-4 text-sm font-bold text-emerald-800"><Link to="/">MEMORY JAR · 로컬 검증 (서버 요청 없음)</Link><nav className="flex gap-4"><Link to="/contact-sheet">30종 한눈에</Link><Link to="/?draft=999">후보·편집 검증</Link></nav></header><Routes><Route path="/jars/999" element={<Result/>}/><Route path="/contact-sheet" element={<ContactSheet/>}/><Route path="*" element={<JarDesignNewPage/>}/></Routes></StompClientProvider></MemoryRouter>);
