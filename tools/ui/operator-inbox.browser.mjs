import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// 실제 문의 화면·API 모듈·재조회 훅을 브라우저에서 검사한다. 운영 서버·사용자 프로필은 사용하지 않는다.
const root = resolve(import.meta.dirname, "../.."), outputDir = resolve(root, "build/operator-inbox");
await mkdir(outputDir, { recursive: true });
const require = createRequire(resolve(root, "frontend/package.json"));
const { build } = await import(pathToFileURL(require.resolve("vite")).href);
const { default: react } = await import(pathToFileURL(require.resolve("@vitejs/plugin-react")).href);
const { default: tailwindcss } = await import(pathToFileURL(require.resolve("@tailwindcss/vite")).href);
const titles = ["사진을 추가하다가 업로드가 멈췄어요", "저금통 초대 링크를 확인해 주세요", "구글 로그인 후 다른 계정으로 들어가요", "쪽지의 추억 날짜를 확인하고 싶어요"];
const tickets = Array.from({ length: 14 }, (_, i) => ({ inquiryId: 128 - i, title: titles[i] || `이전 문의 ${128 - i}`, category: ["PHOTO_UPLOAD", "INVITE_ACCESS", "LOGIN_ACCOUNT", "NOTES_CHAT"][i % 4],
  description: ["쪽지를 쓰면서 사진 두 장을 추가했는데 한 장이 계속 준비 중으로 보여요.", "친구에게 보낸 초대 링크가 만료됐다고 나와요. 새로 만들어야 할까요?", "이전에 네이버로 사용하던 저금통을 찾고 싶어요.", "날짜별 정렬 안내를 확인했어요. 감사합니다."][i % 4],
  status: ["OPEN", "IN_PROGRESS", "WAITING_USER", "RESOLVED"][i % 4], createdAt: "2026-11-20T14:10:00", imageExpiresAt: "2026-12-20T14:10:00", contentExpired: false, imageAvailable: i === 0 }));
const state = { operator: true, listCalls: 0, viewCalls: [], writes: [], messageIds: new Map(), messages: new Map(), attachments: [], listFail: false, writeFail: false, listDelays: {}, viewDelays: {} };
const entry = `import React,{useState,useLayoutEffect} from 'react';import {createRoot} from 'react-dom/client';
import {MemoryRouter,Routes,Route,useNavigate} from 'react-router-dom';import Page from '@actual-page';import Logo from '@logo';import '@index-css';
function Fixture(){const[me,setMe]=useState({userId:1}),navigate=useNavigate();useLayoutEffect(()=>{window.fixture={setMe,navigate};},[navigate]);
return <><header style={{height:80,background:'white',borderBottom:'1px solid #e2e8f0'}}><div style={{maxWidth:1216,margin:'auto',height:'100%',display:'flex',alignItems:'center',gap:12,padding:'0 18px',color:'#009f77',fontSize:18,fontWeight:750,letterSpacing:4}}><Logo className='h-10 w-10'/>MEMORY JAR</div></header>
<Routes><Route path='/admin/support/inquiries/:inquiryId?' element={<Page key={me?.userId??'anonymous'} me={me} checkingAuth={false} operator/>}/><Route path='/support/inquiries/:inquiryId?' element={<Page key={me?.userId??'anonymous'} me={me} checkingAuth={false}/>}/><Route path='*' element={<p>다른 화면</p>}/></Routes></>;}createRoot(document.getElementById('root')).render(<React.StrictMode><MemoryRouter initialEntries={['/admin/support/inquiries']}><Fixture/></MemoryRouter></React.StrictMode>);`;
const built = await build({ root: resolve(root, "frontend"), configFile: false, logLevel: "warn",
  define: { "process.env.NODE_ENV": '"production"', "import.meta.env.VITE_API_BASE_URL": '""' },
  resolve: { alias: [
    ...["react", "react-dom", "react-router-dom"].map(name => ({ find: new RegExp(`^${name}(?=/|$)`), replacement: resolve(root, "frontend/node_modules", name) })),
    { find: "@actual-page", replacement: resolve(root, "frontend/src/pages/SupportInquiriesPage.jsx") },
    { find: "@logo", replacement: resolve(root, "frontend/src/components/icons/MemoryJarLogoIcon.jsx") },
    { find: "@index-css", replacement: resolve(root, "frontend/src/index.css") },
  ] }, plugins: [react(), tailwindcss(), { name: "isolated-inbox-entry", enforce: "pre",
    resolveId(id) { if (id.endsWith("inbox-browser-entry.jsx")) return "\0inbox-browser-entry.jsx"; if (id.endsWith("/StompClientProvider") || id === "./StompClientProvider") return "\0fixture-stomp"; },
    load(id) { if (id === "\0inbox-browser-entry.jsx") return entry;
      if (id === "\0fixture-stomp") return `const listeners=new Set();window.emitSupport=(inquiryId)=>listeners.forEach(fn=>fn({body:JSON.stringify({type:'SUPPORT_CHANGED',inquiryId})}));const value={connected:false,subscribe:({onMessage})=>{listeners.add(onMessage);return()=>listeners.delete(onMessage);}};export const useStompClient=()=>value;`; }
  }], build: { write: false, minify: false, lib: { entry: "inbox-browser-entry.jsx", formats: ["es"], fileName: "inbox" } } });
const chunks = Array.isArray(built) ? built.flatMap(result => result.output) : built.output;
const assets = new Map(chunks.map(item => ["/" + item.fileName, item.type === "chunk" ? item.code : item.source]));
const script = chunks.find(item => item.type === "chunk" && item.isEntry).fileName;
const links = chunks.filter(item => item.fileName.endsWith(".css")).map(item => `<link rel="stylesheet" href="/${item.fileName}">`).join("");
const page = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>문의함 실제 컴포넌트 검증</title>${links}</head><body><div id="root"></div><script type="module" src="/${script}"></script></body></html>`;
const pixel = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6ioAAAAASUVORK5CYII=", "base64");
const server = createServer(async (request, response) => {
  const url = new URL(request.url, "http://localhost"), path = url.pathname;
  const reply = (data, status = 200) => { response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" }); response.end(JSON.stringify(status === 200 ? { data } : { error: { message: data } })); };
  try {
    if (assets.has(path)) { response.writeHead(200, { "Content-Type": path.endsWith(".css") ? "text/css" : "text/javascript" }); response.end(assets.get(path)); return; }
    if (path === "/fonts/pretendard/PretendardVariable-1.3.9.woff2") { response.writeHead(200, { "Content-Type": "font/woff2" }); response.end(await readFile(resolve(root, "frontend/public", path.slice(1)))); return; }
    if (path === "/image.png") { response.writeHead(200, { "Content-Type": "image/png" }); response.end(pixel); return; }
    if (path === "/api/v1/csrf") { reply({ headerName: "X-XSRF-TOKEN", token: "local-test-token" }); return; }
    if (path === "/api/v1/support/permissions") { reply({ operator: state.operator }); return; }
    if (path.startsWith("/api/")) {
      const admin = path.includes("/admin/");
      if (admin && !state.operator) { reply("서비스 운영자만 이용할 수 있습니다.", 403); return; }
      const match = /^\/api\/v1\/(?:admin\/)?support\/inquiries(?:\/(\d+))?(?:\/(.*))?$/.exec(path);
      if (!match) { reply("Not found", 404); return; }
      const id = Number(match[1]), action = match[2];
      if (!id) {
        state.listCalls++; const status = url.searchParams.get("status") || "", before = Number(url.searchParams.get("before")) || Infinity;
        const rows = tickets.filter(item => item.inquiryId < before && (!status || item.status === status));
        const result = structuredClone({ items: rows.slice(0, 12), nextBefore: rows.length > 12 ? rows[11].inquiryId : null });
        if (state.listDelays[status]) await new Promise(resolve => setTimeout(resolve, state.listDelays[status]));
        if (state.listFail) { state.listFail = false; reply("목록 시험 오류", 503); } else reply(result);
        return;
      }
      const ticket = tickets.find(item => item.inquiryId === id);
      if (!ticket) { reply("존재하지 않는 문의입니다.", 404); return; }
      if (request.method === "GET") {
        if (action === "view") {
          state.viewCalls.push(id);
          const data = structuredClone({ inquiry: ticket, messages: { items: state.messages.get(id) || [], nextBefore: null }, attachments: state.attachments.filter(item => item.inquiryId === id) });
          if (state.viewDelays[id]) await new Promise(resolve => setTimeout(resolve, state.viewDelays[id]));
          reply(data); return;
        }
        if (action === "image" || action?.endsWith("/image")) { reply({ previewUrl: "/image.png", expiresAt: new Date(Date.now() + 30000).toISOString() }); return; }
        if (action === "messages") { reply({ items: [], nextBefore: null }); return; }
      }
      if (request.method === "POST") {
        assert.equal(request.headers["x-xsrf-token"], "local-test-token", "Real API module sent CSRF header");
        let body = ""; for await (const chunk of request) body += chunk;
        if (action === "messages") {
          const input = JSON.parse(body);
          if (!state.messageIds.has(input.requestId)) {
            const message = { messageId: state.writes.length + 1, role: "OPERATOR", content: input.content, createdAt: "2026-11-20T15:00:00" };
            state.messageIds.set(input.requestId, message); state.writes.push({ id, ...input });
            state.messages.set(id, [...(state.messages.get(id) || []), message]); ticket.status = input.waitingForUser ? "WAITING_USER" : "ANSWERED";
          }
          await new Promise(resolve => setTimeout(resolve, 80));
          if (state.writeFail) { state.writeFail = false; reply("응답 유실 시험", 503); } else reply(state.messageIds.get(input.requestId)); return;
        }
        if (action === "attachments") { const attachment = { inquiryId: id, attachmentId: state.attachments.length + 1, expiresAt: "2026-12-01T00:00:00" }; state.attachments.push(attachment); reply(attachment); return; }
        ticket.status = action === "review" || action === "reopen" ? "IN_PROGRESS" : "RESOLVED"; reply(ticket); return;
      }
      reply("Not found", 404); return;
    }
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); response.end(page);
  } catch (error) { reply(error.message, 500); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const address = `http://127.0.0.1:${server.address().port}`;
let child, socket;
const checks = [];
try {
  const profile = await mkdtemp(resolve(outputDir, "browser-profile-"));
  child = spawn(process.env.MEMORYJAR_TEST_CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe", ["--headless=new", "--remote-debugging-port=0", "--remote-debugging-address=127.0.0.1", `--user-data-dir=${profile}`, "--hide-scrollbars", "--disable-background-networking", "--disable-component-update", "--disable-sync", "--disable-extensions", "--no-first-run", "--no-default-browser-check", "--disable-gpu", "--no-proxy-server", "about:blank"], { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
  const endpoint = await new Promise((resolve, reject) => {
    let stderr = ""; const timer = setTimeout(() => reject(new Error("Chrome did not start")), 20000);
    child.stderr.on("data", chunk => { stderr += chunk; const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/); if (match) { clearTimeout(timer); resolve(match[1]); } });
    child.once("error", error => { clearTimeout(timer); reject(error); }); child.once("exit", code => { clearTimeout(timer); reject(new Error(`Chrome exit ${code}`)); });
  });
  socket = new WebSocket(endpoint); await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }); });
  let counter = 0; const pending = new Map();
  socket.addEventListener("message", event => { const data = JSON.parse(event.data), task = pending.get(data.id); if (task) { pending.delete(data.id); clearTimeout(task.timer); data.error ? task.reject(new Error(data.error.message)) : task.resolve(data.result); } });
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => { const id = ++counter, timer = setTimeout(() => { pending.delete(id); reject(new Error(`${method} timeout`)); }, 10000); pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params, sessionId })); });
  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  const evaluate = async expression => { const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }, sessionId); if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails)); return result.result.value; };
  const wait = async (expression, label = expression) => { for (let i = 0; i < 100; i++) { if (await evaluate(`Boolean(${expression})`)) return; await new Promise(resolve => setTimeout(resolve, 60)); } throw new Error(`Wait failed: ${label}`); };
  const clickText = (text, scope = "") => evaluate(`(()=>{const b=[...document.querySelectorAll(${JSON.stringify(`${scope} button`.trim())})].find(b=>b.textContent.trim()===${JSON.stringify(text)});if(!b)throw new Error('button missing');b.click();})()`);
  const select = async id => { await evaluate(`document.querySelectorAll('.operator-inbox-item')[${tickets.findIndex(item => item.inquiryId === id)}].click()`); await wait(`document.querySelector('.operator-inbox-detail-toolbar')?.textContent.includes('#${id}')`); };
  const type = value => evaluate(`(()=>{const t=document.querySelector('textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(t,${JSON.stringify(value)});t.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  const capture = async (name, width, height) => {
    await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 700 }, sessionId);
    await evaluate("document.fonts.ready.then(()=>true)"); await evaluate("document.activeElement?.blur()"); await new Promise(resolve => setTimeout(resolve, 60));
    assert.equal(await evaluate("document.documentElement.scrollWidth<=innerWidth"), true, `${width}px no horizontal overflow`);
    const metrics = await send("Page.getLayoutMetrics", {}, sessionId), image = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, clip: { x: 0, y: 0, width, height: Math.ceil(metrics.cssContentSize.height), scale: 1 } }, sessionId);
    await writeFile(resolve(outputDir, name), Buffer.from(image.data, "base64"));
  };
  await send("Page.enable", {}, sessionId); await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false }, sessionId);
  await send("Page.navigate", { url: address }, sessionId);
  await wait("document.querySelector('.operator-inbox-detail-toolbar')?.textContent.includes('#128')");
  await wait("document.querySelector('textarea')"); checks.push("initial auto-selection and real API/detail load");
  await capture("operator-inbox-desktop.png", 1440, 1100); await capture("operator-inbox-mobile.png", 390, 1100);
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false }, sessionId);
  const callsBefore = state.listCalls; await select(127); await select(128); assert.equal(state.listCalls, callsBefore); checks.push("selection does not refetch list");
  await type("작성하던 답변을 유지합니다."); await wait("document.querySelector('.operator-inbox-draft-badge')");
  await select(127); await select(128); assert.equal(await evaluate("document.querySelector('textarea').value"), "작성하던 답변을 유지합니다."); checks.push("per-inquiry reply restoration");
  state.writeFail = true; await evaluate("document.querySelector('form').requestSubmit();document.querySelector('form').requestSubmit()");
  await wait("document.querySelector('[role=alert]')?.textContent.includes('응답 유실')"); assert.equal(state.writes.length, 1);
  await select(127); await select(128); await evaluate("document.querySelector('form').requestSubmit()");
  await wait("document.querySelector('textarea')?.value===''"); assert.equal(state.writes.length, 1); checks.push("double-submit and response-loss retry across selection is idempotent");
  await wait("document.querySelector('.operator-inbox-item[aria-current]')?.textContent.includes('답변 완료')"); checks.push("mutation updates list and conversation");
  await clickText("해결 완료", ".support-letter-detail"); await wait("document.querySelector('.support-letter-detail')?.textContent.includes('해결된 문의예요')");
  await clickText("다시 확인 · 문의 다시 열기"); await wait("document.querySelector('textarea')"); checks.push("resolve and reopen");
  await evaluate(`(async()=>{document.querySelector('form details summary').click();const canvas=document.createElement('canvas');canvas.width=8;canvas.height=8;canvas.getContext('2d').fillRect(0,0,8,8);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));const transfer=new DataTransfer();transfer.items.add(new File([blob],'local-test.png',{type:'image/png'}));const input=document.querySelector('input[type=file]');input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await wait("document.querySelector('img[alt=\"선택한 화면 자료 미리보기\"]')");
  await select(127); await select(128); await wait("document.querySelector('img[alt=\"선택한 화면 자료 미리보기\"]')"); checks.push("local screenshot survives inquiry selection");
  await evaluate("[...document.querySelectorAll('form label')].find(label=>label.textContent.includes('선택한 화면 자료 공유')).querySelector('input').click();document.querySelector('form input[type=checkbox]').click()");
  await type("첨부한 화면을 확인해 주세요."); await evaluate("document.querySelector('form').requestSubmit()");
  await wait("document.querySelector('textarea')?.value===''"); assert.equal(state.attachments.length, 1); assert.equal(state.writes[1].waitingForUser, true);
  await wait("document.querySelector('.operator-inbox-item[aria-current]')?.textContent.includes('추가 정보 대기')"); checks.push("screenshot upload and waiting-for-user answer preserve API and CSRF contract");
  await clickText("접수"); await wait("[...document.querySelectorAll('.operator-inbox-item')].every(b=>b.textContent.includes('접수')) && document.querySelectorAll('.operator-inbox-item').length===3");
  await clickText("답변 완료"); await wait("document.querySelector('.operator-inbox-list').textContent.includes('해당 상태의 문의가 없어요')"); checks.push("server status filtering and empty results");
  await clickText("전체"); await wait("document.querySelectorAll('.operator-inbox-item').length===12");
  await evaluate("const next=[...document.querySelectorAll('.operator-inbox-pages button')][1];next.click();next.click()"); await wait("document.querySelectorAll('.operator-inbox-item').length===2");
  await clickText("이전"); await wait("document.querySelectorAll('.operator-inbox-item').length===12"); checks.push("cursor pagination");
  state.listFail = true; await clickText("↻ 새로고침"); await wait("document.querySelector('[role=alert]')?.textContent.includes('목록 시험 오류')");
  await clickText("다시 시도"); await wait("!document.querySelector('[role=alert]')"); checks.push("failed refresh keeps data and retries");
  state.listDelays.OPEN = 300; await clickText("접수"); await clickText("해결 완료"); await wait("document.querySelector('.operator-inbox-list').textContent.includes('해결 완료')");
  await new Promise(resolve => setTimeout(resolve, 350)); assert.equal(await evaluate("document.querySelector('.operator-inbox-filters [aria-pressed=true]').textContent"), "해결 완료"); checks.push("late filter response cannot replace current filter");
  state.listDelays = {}; await clickText("전체"); await wait("document.querySelectorAll('.operator-inbox-item').length===12");
  state.viewDelays[127] = 250; await evaluate("document.querySelectorAll('.operator-inbox-item')[1].click()"); await select(126); await new Promise(resolve => setTimeout(resolve, 300));
  assert.equal(await evaluate("document.querySelector('.operator-inbox-detail-toolbar').textContent.includes('#126')"), true); state.viewDelays = {}; checks.push("late inquiry response cannot overwrite another inquiry");
  await type("계정 간에 전달되면 안 되는 답변"); await evaluate("window.fixture.setMe({userId:99})"); await wait("document.querySelector('textarea')?.value===''"); checks.push("account switch clears unsent private reply");
  await select(128); await clickText("원본 이미지 보기"); await wait("document.querySelector('img[alt=\"문의 접수 시 공유한 원본\"]')?.complete"); await clickText("원본 이미지 닫기"); checks.push("authorized original image opens on demand");
  await type(""); await capture("operator-inbox-with-reply-desktop.png", 1440, 1100); await capture("operator-inbox-with-reply-mobile.png", 390, 1100); checks.push("PC and mobile layout");
  // 구독 자체와 병합/재조회는 실제 훅을 사용한다. 전송 계층만 로컬 시험용으로 대체한다.
  const oldCalls = state.listCalls; tickets[0].title = "실시간으로 바뀐 문의 제목";
  await evaluate("window.emitSupport(128)"); await wait("document.querySelector('.operator-inbox-item').textContent.includes('실시간으로 바뀐 문의 제목')");
  assert.ok(state.listCalls > oldCalls); checks.push("live support event refreshes inbox");
  state.operator = false; await evaluate("window.emitSupport(128)"); await wait("!document.querySelector('.operator-inbox-workspace')"); checks.push("revoked operator access removes private content");
  state.operator = true; await evaluate("window.fixture.setMe({userId:100})"); await wait("document.querySelector('textarea')");
  await evaluate("window.fixture.navigate('/admin/support/inquiries/99999')"); await wait("document.querySelector('[role=alert]')?.textContent.includes('존재하지 않는 문의')");
  assert.equal(await evaluate("Boolean(document.querySelector('textarea'))"), false); checks.push("missing inquiry displays safe error");
  await evaluate("window.fixture.navigate('/support/inquiries/128')"); await wait("document.querySelector('textarea[aria-label=\"추가 문의 내용\"]')");
  assert.equal(await evaluate("Boolean(document.querySelector('.operator-inbox-workspace'))"), false); checks.push("ordinary user inquiry keeps existing layout");
  await evaluate("window.fixture.setMe(null);window.fixture.navigate('/admin/support/inquiries')"); await wait("document.body.textContent.includes('로그인 후 운영 문의함')"); checks.push("anonymous operator page does not load private inbox");
  await writeFile(resolve(outputDir, "browser-results.json"), JSON.stringify({ passed: checks.length, checks }, null, 2));
  console.log(JSON.stringify({ passed: checks.length, checks }, null, 2)); await send("Browser.close");
} finally { socket?.close(); if (child && child.exitCode === null) child.kill(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
