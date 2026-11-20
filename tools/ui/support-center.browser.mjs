import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { openSupportTestBrowser } from "./isolated-support-browser.mjs";

// 제품 화면·API·CSRF·재조회 훅은 실제 코드다. HTTP/소켓 전송만 가짜 서버로 바꾼다.
const root = resolve(import.meta.dirname, "../.."), destination = resolve(root, "build/support-center");
await mkdir(destination, { recursive: true });
const require = createRequire(resolve(root, "frontend/package.json"));
const { build } = await import(pathToFileURL(require.resolve("vite")).href);
const { default: react } = await import(pathToFileURL(require.resolve("@vitejs/plugin-react")).href);
const { default: tailwindcss } = await import(pathToFileURL(require.resolve("@tailwindcss/vite")).href);
const faqSource = await readFile(resolve(root, "src/main/java/shop/esjh/memoryjar/service/support/SupportFaqService.java"), "utf8");
const faq = faqSource.split(/\r?\n/).filter(line => line.includes("new Faq(")).map(line => { const [id, category, question, answer] = [...line.matchAll(/"(?:[^"\\]|\\.)*"/g)].map(match => JSON.parse(match[0])); return { id, category, question, answer }; });
const tickets = Array.from({ length: 14 }, (_, index) => ({ inquiryId: 128 - index, owner: 1, category: "PHOTO_UPLOAD", title: index === 0 ? "사진을 추가하다가 업로드가 멈췄어요" : `내 문의 ${128 - index}`, description: "쪽지를 쓰면서 사진 두 장을 추가했는데 한 장이 계속 준비 중으로 보여요.", status: ["WAITING_USER", "ANSWERED", "OPEN"][index % 3], createdAt: "2026-11-20T14:10:00", contentExpired: false, imageAvailable: false }));
const state = { user: 1, faqCalls: 0, faqFail: false, listFail: false, listDelay: 0, listRequests: 0, guestActive: true, sessionCalls: 0, sessionCreates: 0, creates: new Map(), nextId: 129, createFail: false, uploadFail: false, uploads: new Map(), uploadIds: [], messages: new Map(), guestViews: 0 };
const entry = `import React,{useLayoutEffect,useState} from 'react';import{createRoot}from'react-dom/client';import{MemoryRouter,Route,Routes,useNavigate,useLocation}from'react-router-dom';import Help from '@help';import New from '@new';import List from '@list';import Guest from '@guest';import Logo from '@logo';import '@css';
function Fixture(){const[me,setMe]=useState({userId:1}),navigate=useNavigate(),location=useLocation();useLayoutEffect(()=>{window.fixture={navigate,setMe};window.route=location.pathname+location.search;},[navigate,location]);return <><header style={{height:80,background:'white',borderBottom:'1px solid #e2e8f0'}}><div style={{display:'flex',alignItems:'center',gap:12,maxWidth:1216,margin:'auto',height:'100%',padding:'0 18px',fontSize:18,fontWeight:750,letterSpacing:4,color:'#009f77'}}><Logo className='h-10 w-10'/>MEMORY JAR</div></header><Routes><Route path='/help' element={<Help me={me}/>}/><Route path='/support/new' element={<New key={me?.userId??'anonymous'} me={me} checkingAuth={false}/>}/><Route path='/support/inquiries/:inquiryId?' element={<List key={me?.userId??'anonymous'} me={me} checkingAuth={false}/>}/><Route path='/support/login-help' element={<Guest/>}/><Route path='*' element={<p>다른 화면</p>}/></Routes></>;}createRoot(document.getElementById('root')).render(<React.StrictMode><MemoryRouter initialEntries={['/help?from=%2Fjars%2F91&jarId=91']}><Fixture/></MemoryRouter></React.StrictMode>);`;
const output = await build({ root: resolve(root, "frontend"), configFile: false, logLevel: "warn", define: { "process.env.NODE_ENV": '"production"', "import.meta.env.VITE_API_BASE_URL": '""' },
  resolve: { alias: [...["react", "react-dom", "react-router-dom"].map(name => ({ find: new RegExp(`^${name}(?=/|$)`), replacement: resolve(root, "frontend/node_modules", name) })),
    ...[["@help", "pages/SupportHelpPage.jsx"], ["@new", "pages/SupportNewPage.jsx"], ["@list", "pages/SupportInquiriesPage.jsx"], ["@guest", "pages/SupportLoginHelpPage.jsx"], ["@logo", "components/icons/MemoryJarLogoIcon.jsx"], ["@css", "index.css"]].map(([find, path]) => ({ find, replacement: resolve(root, "frontend/src", path) }))] },
  plugins: [react(), tailwindcss(), { name: "actual-support-center-entry", enforce: "pre", resolveId(id) { if (id.endsWith("support-center-entry.jsx")) return "\0support-center-entry.jsx"; if (id.endsWith("/StompClientProvider")) return "\0socket"; }, load(id) { if (id === "\0support-center-entry.jsx") return entry; if (id === "\0socket") return `const subscriptions=new Set();window.supportSubscriptions=subscriptions;window.emitSupport=id=>subscriptions.forEach(s=>s.onMessage({body:JSON.stringify({type:'SUPPORT_CHANGED',inquiryId:id})}));const context={connected:false,subscribe:s=>{subscriptions.add(s);return()=>subscriptions.delete(s);}};export const useStompClient=()=>context;`; } }],
  build: { write: false, minify: false, lib: { entry: "support-center-entry.jsx", formats: ["es"], fileName: "actual-support" } } });
const chunks = Array.isArray(output) ? output.flatMap(result => result.output) : output.output;
const assets = new Map(chunks.map(item => ["/" + item.fileName, item.type === "chunk" ? item.code : item.source]));
const script = chunks.find(item => item.type === "chunk" && item.isEntry).fileName;
const css = chunks.filter(item => item.fileName.endsWith(".css")).map(item => `<link rel="stylesheet" href="/${item.fileName}">`).join("");
const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'self';script-src 'self' 'unsafe-inline';style-src 'self' 'unsafe-inline';font-src 'self';img-src 'self' blob: data:;connect-src 'self'"><title>제품 도움말·문의 검증</title>${css}</head><body><div id="root"></div><script type="module" src="/${script}"></script></body></html>`;
const server = createServer(async (request, response) => {
  const url = new URL(request.url, "http://localhost"), path = url.pathname;
  const reply = (data, status = 200) => { response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" }); response.end(JSON.stringify(status === 200 ? { data } : { error: { message: data } })); };
  try {
    if (assets.has(path)) { response.writeHead(200, { "Content-Type": path.endsWith(".css") ? "text/css" : "text/javascript" }); response.end(assets.get(path)); return; }
    if (path === "/fonts/pretendard/PretendardVariable-1.3.9.woff2") { response.writeHead(200, { "Content-Type": "font/woff2" }); response.end(await readFile(resolve(root, "frontend/public", path.slice(1)))); return; }
    if (!path.startsWith("/api/")) { response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); response.end(html); return; }
    if (path === "/api/v1/public/support/faq") { state.faqCalls++; if (state.faqFail) { state.faqFail = false; reply("도움말 시험 오류", 503); } else reply(faq); return; }
    if (path === "/api/v1/csrf") { reply({ headerName: "X-XSRF-TOKEN", token: "local-csrf" }); return; }
    const guest = path.includes("/public/"), hasGuest = state.guestActive && request.headers.cookie?.includes("MJ_SUPPORT_TEST=fixture");
    if (request.method === "POST") assert.equal(request.headers["x-xsrf-token"], "local-csrf");
    if (path === "/api/v1/public/support/session") {
      state.sessionCalls++;
      if (request.method === "POST") { state.guestActive = true; state.sessionCreates++; response.setHeader("Set-Cookie", "MJ_SUPPORT_TEST=fixture; HttpOnly; SameSite=Lax; Path=/"); reply({ active: true, expiresAt: "2026-12-20T00:00:00" }); }
      else reply({ active: Boolean(hasGuest), expiresAt: hasGuest ? "2026-12-20T00:00:00" : null });
      return;
    }
    if (guest && !hasGuest) { reply("문의 쿠키가 없거나 만료됐어요.", 403); return; }
    const match = /^\/api\/v1\/(?:public\/)?support\/inquiries(?:\/(\d+|general))?(?:\/(.*))?$/.exec(path);
    if (!match) { reply("알 수 없는 경로", 404); return; }
    const id = Number(match[1]), action = match[2], general = match[1] === "general";
    if (request.method === "POST" && (general || (guest && !id))) {
      let body = ""; for await (const chunk of request) body += chunk;
      const input = JSON.parse(body), key = `${guest ? "guest" : state.user}:${input.requestId}`;
      if (!state.creates.has(key)) { const saved = { ...input, inquiryId: state.nextId++, owner: guest ? "guest" : state.user, status: "OPEN", createdAt: "2026-11-20T15:00:00", contentExpired: false, imageAvailable: false }; tickets.unshift(saved); state.creates.set(key, saved); }
      await new Promise(resolve => setTimeout(resolve, 70));
      if (state.createFail) { state.createFail = false; reply("접수 응답 유실 시험", 503); } else reply(state.creates.get(key));
      return;
    }
    if (!id) {
      state.listRequests++;
      const before = Number(url.searchParams.get("before")) || Infinity;
      const rows = structuredClone(tickets.filter(ticket => ticket.owner === (guest ? "guest" : state.user) && ticket.inquiryId < before));
      if (state.listDelay) await new Promise(resolve => setTimeout(resolve, state.listDelay));
      if (state.listFail) { state.listFail = false; reply("목록 시험 오류", 503); } else reply({ items: rows.slice(0, 12), nextBefore: rows.length > 12 ? rows[11].inquiryId : null });
      return;
    }
    const ticket = tickets.find(item => item.inquiryId === id && item.owner === (guest ? "guest" : state.user));
    if (!ticket) { reply("존재하지 않거나 접근할 수 없는 문의예요.", 404); return; }
    if (request.method === "GET") {
      if (action === "view") { if (guest) { state.guestViews++; if (state.denyGuestView) { reply("문의 조회 권한이 없어요.", 403); return; } } reply({ inquiry: ticket, messages: { items: state.messages.get(id) || [], nextBefore: null }, attachments: [...state.uploads.values()].filter(item => item.inquiryId === id) }); return; }
      if (action === "messages") { reply({ items: [], nextBefore: null }); return; }
    }
    if (request.method === "POST") {
      let body = ""; for await (const chunk of request) body += chunk;
      if (action === "attachments") {
        const requestId = /name="requestId"\r\n\r\n([^\r]+)/.exec(body)?.[1]; assert.ok(requestId);
        state.uploadIds.push(requestId);
        const key = `${id}:${requestId}`;
        if (!state.uploads.has(key)) state.uploads.set(key, { inquiryId: id, attachmentId: state.uploads.size + 1, status: "READY", expiresAt: "2026-12-20T00:00:00" });
        if (state.uploadFail) { state.uploadFail = false; reply("첨부 응답 유실 시험", 503); } else reply(state.uploads.get(key)); return;
      }
      if (action === "messages") { const input = JSON.parse(body); const message = { messageId: 1, role: "USER", content: input.content, createdAt: "2026-11-20T15:10:00" }; state.messages.set(id, [message]); ticket.status = "IN_PROGRESS"; reply(message); return; }
      ticket.status = action === "resolve" ? "RESOLVED" : "IN_PROGRESS"; reply(ticket); return;
    }
    reply("알 수 없는 요청", 404);
  } catch (error) { reply(error.message, 500); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
let browser; const checks = [];
try {
  browser = await openSupportTestBrowser(destination); const { evaluate: evaluate, wait } = browser;
  const navigate = async path => { await evaluate(`window.fixture.navigate(${JSON.stringify(path)})`); await new Promise(resolve => setTimeout(resolve, 50)); };
  const visible = selector => `[...document.querySelectorAll(${JSON.stringify(selector)})].find(item=>item.getClientRects().length)`;
  const click = (text, scope = "button") => evaluate(`(()=>{const button=[...document.querySelectorAll(${JSON.stringify(scope)})].find(item=>item.getClientRects().length&&item.textContent.trim()===${JSON.stringify(text)});if(!button)throw new Error('button missing');button.click();})()`);
  const type = (selector, value) => evaluate(`(()=>{const item=${visible(selector)};Object.getOwnPropertyDescriptor(Object.getPrototypeOf(item),'value').set.call(item,${JSON.stringify(value)});item.dispatchEvent(new Event(item.tagName==='SELECT'?'change':'input',{bubbles:true}));})()`);
  const addFile = async () => { await evaluate(`(async()=>{const canvas=document.createElement('canvas');canvas.width=8;canvas.height=8;canvas.getContext('2d').fillRect(0,0,8,8);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));const transfer=new DataTransfer();transfer.items.add(new File([blob],'local-test.png',{type:'image/png'}));const input=${visible("input[type=file]")};input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));})()`); await wait(`${visible("img[alt='선택한 화면 자료 미리보기']")}`); };
  const sendForm = () => evaluate(`${visible("form")}.requestSubmit()`);
  await browser.viewport(1440); await browser.navigate(`http://127.0.0.1:${server.address().port}/`);
  await wait("document.querySelectorAll('.sc-faq-list details').length===8");
  await browser.capture("help-desktop.png", 1440); await browser.capture("help-mobile.png", 390); await browser.viewport(1440);
  const faqCalls = state.faqCalls;
  await type("input[type=search]", "검색 결과가 없는 예시"); await wait("document.querySelector('.sc-no-results')");
  await click("검색 조건 초기화"); await wait("document.querySelectorAll('.sc-faq-list details').length===8");
  await click("사진", ".sc-topic-filters button"); await wait("document.querySelectorAll('.sc-faq-list details').length===1"); assert.equal(state.faqCalls, faqCalls); checks.push("FAQ search/topic/reset are local and preserve URL state");
  const newPath = await evaluate("document.querySelector('.sc-section-nav a[href^=\"/support/new\"]').getAttribute('href')");
  assert.match(newPath, /jarId=91/); assert.doesNotMatch(newPath, /category=/); checks.push("shared navigation preserves only safe inquiry context");
  await navigate(newPath); await wait("document.querySelector('form')");
  assert.equal(await evaluate("document.querySelector('button[type=submit]').disabled"), true);
  assert.equal(await evaluate("document.querySelector('select').lastElementChild.textContent"), "기타");
  await type("input[aria-label='문의 제목']", "사진 추가가 멈췄어요"); await type("textarea", "쪽지에 사진을 추가하다가 같은 화면에서 멈췄어요."); await type("select", "PHOTO_UPLOAD");
  await browser.capture("new-desktop.png", 1440); await browser.capture("new-mobile.png", 390);
  assert.ok(await evaluate("document.querySelector('textarea').getBoundingClientRect().width>=innerWidth-100")); await browser.viewport(1440);
  await addFile(); assert.equal(await evaluate("document.querySelector('button[type=submit]').disabled"), true);
  await evaluate("[...document.querySelectorAll('form label')].find(item=>item.textContent.includes('선택한 화면 자료를')).querySelector('input').click()"); checks.push("form validation, category order, screenshot consent and mobile width");
  state.createFail = true; await evaluate("document.querySelector('form').requestSubmit();document.querySelector('form').requestSubmit()");
  await wait("document.querySelector('[role=alert]')?.textContent.includes('접수 응답 유실')"); assert.equal(state.creates.size, 1); checks.push("double submit and lost create response save one inquiry");
  state.uploadFail = true; await sendForm(); await wait("document.querySelector('[role=alert]')?.textContent.includes('응답 유실 시험')");
  await sendForm(); await wait("window.route.startsWith('/support/inquiries/') && document.querySelector('.support-letter-detail h2')");
  assert.equal(state.creates.size, 1); assert.equal(state.uploads.size, 1); assert.equal(state.uploadIds[0], state.uploadIds[1]);
  const created = [...state.creates.values()][0]; assert.equal(created.jarId, 91); assert.equal(created.contextPath, "/jars/91"); checks.push("partial screenshot retry reuses attachment request ID and saved inquiry with CSRF");
  await type("textarea", "추가 설명을 남깁니다."); await sendForm(); await wait("document.querySelector('.support-letter-message')?.textContent.includes('추가 설명')");
  await click("해결됐어요"); await wait("document.querySelector('.support-letter-detail')?.textContent.includes('해결된 문의예요')");
  await click("아직 문제가 있어요 · 다시 문의"); await wait("document.querySelector('textarea')"); checks.push("detail reply/resolve/reopen and sidebar status use same response");
  await navigate("/support/inquiries"); await wait("document.querySelectorAll('.sc-ticket-row').length===12");
  await browser.capture("inquiries-desktop.png", 1440); await browser.capture("inquiries-mobile.png", 390); await browser.viewport(1440);
  await click("다음", ".sc-pages button"); await wait("document.querySelectorAll('.sc-ticket-row').length===3"); await click("이전", ".sc-pages button"); await wait("document.querySelectorAll('.sc-ticket-row').length===12"); checks.push("cursor pagination and safe list return");
  state.listFail = true; await click("새로고침"); await wait("document.querySelector('[role=alert]')?.textContent.includes('목록 시험 오류')");
  assert.equal(await evaluate("document.querySelectorAll('.sc-ticket-row').length"), 12); await click("다시 시도"); await wait("!document.querySelector('[role=alert]')"); checks.push("refresh failure preserves list and can retry");
  tickets[0].title = "실시간 갱신된 문의"; await evaluate(`window.emitSupport(${tickets[0].inquiryId})`); await wait("document.querySelector('.sc-ticket-row')?.textContent.includes('실시간 갱신된 문의')"); checks.push("logged-in inbox reacts to live support event");
  state.listDelay = 250; const previousRequests = state.listRequests; await click("새로고침");
  for(let n=0;n<100&&state.listRequests===previousRequests;n++)await new Promise(resolve=>setTimeout(resolve,10));
  assert.ok(state.listRequests>previousRequests,"Previous account request reached the server before switching");
  state.user = 99; await evaluate("window.fixture.setMe({userId:99})");
  await wait("document.querySelector('.sc-empty-card')"); await new Promise(resolve => setTimeout(resolve, 300)); assert.equal(await evaluate("document.querySelectorAll('.sc-ticket-row').length"), 0); state.listDelay = 0; checks.push("account switch ignores late previous-account list response");
  await browser.capture("empty-desktop.png", 1440); assert.equal(await evaluate("Boolean(document.querySelector('.sc-pages'))"), false); checks.push("empty inbox hides pagination");
  await evaluate("window.fixture.setMe(null)"); await navigate("/support/new?from=%2Fjars%2F91&jarId=91"); await wait("document.querySelector('.sc-empty-card')");
  assert.equal(await evaluate("Boolean(document.querySelector('form'))"), false); assert.match(await evaluate("document.querySelector('.sc-empty-card a').getAttribute('href')"), /returnTo=/); checks.push("anonymous general inquiry requires login and retains return destination");
  await navigate("/help"); await wait("document.querySelectorAll('.sc-faq-list details').length===8"); assert.equal(await evaluate("document.querySelector('.sc-contact-card .is-primary').getAttribute('href')"), "/support/login-help"); checks.push("anonymous help prioritizes login support");
  state.faqFail = true; await navigate("/support/login-help"); await navigate("/help"); await wait("document.querySelector('[role=alert]')?.textContent.includes('도움말 시험 오류')"); await click("다시 시도"); await wait("document.querySelectorAll('.sc-faq-list details').length===8"); checks.push("FAQ API error can retry");
  await navigate("/support/login-help"); await wait("document.querySelector('form')");
  assert.equal(await evaluate("window.supportSubscriptions.size"), 0); await click("이 브라우저의 문의"); await wait("document.querySelector('.sc-empty-card')"); assert.equal(state.sessionCreates, 0); checks.push("guest history is read-only without a cookie and does not subscribe to sockets");
  await click("문의 남기기", ".sc-guest-tabs button"); await type("input[aria-label='문의 제목']", "네이버 로그인이 반복돼요"); await type("textarea", "로그인 후 처음 화면으로 돌아와요."); await addFile();
  await wait("!document.querySelector('.sc-guest-tabs button').disabled"); await click("이 브라우저의 문의", ".sc-guest-tabs button"); await wait("document.querySelectorAll('.sc-guest-tabs button')[1].getAttribute('aria-pressed')==='true'");
  await click("문의 남기기", ".sc-guest-tabs button"); await wait(`${visible("input[aria-label='문의 제목']")}`); assert.equal(await evaluate(`${visible("input[aria-label='문의 제목']")}.value`), "네이버 로그인이 반복돼요"); await wait(`${visible("img[alt='선택한 화면 자료 미리보기']")}`); checks.push("guest tabs preserve unsent text and screenshot in memory");
  await browser.capture("login-new-desktop.png", 1440); await browser.capture("login-new-mobile.png", 390); await browser.viewport(1440);
  await evaluate("[...document.querySelectorAll('form label')].find(item=>item.textContent.includes('선택한 화면 자료를')).querySelector('input').click()");
  await sendForm(); await wait("window.route.includes('inquiry=') && document.querySelector('.sc-detail-card h2')");
  assert.equal(state.sessionCreates, 1); const guestId = tickets.find(ticket => ticket.owner === "guest").inquiryId; assert.ok(state.guestViews); checks.push("guest create issues cookie with CSRF and opens actual saved detail");
  await click("이 브라우저의 문의", ".sc-guest-tabs button"); await wait("document.querySelector('.sc-history-list .sc-ticket-row')");
  await browser.capture("login-history-desktop.png", 1440); await browser.capture("login-history-mobile.png", 390); await browser.viewport(1440);
  assert.equal(await evaluate("window.supportSubscriptions.size"), 0); checks.push("guest history lists only cookie-owned inquiries without sockets");
  for(let n=0;n<13;n++)tickets.unshift({inquiryId:state.nextId++,owner:"guest",category:"LOGIN_ACCOUNT",title:`이전 로그인 문의 ${n}`,description:"로컬 시험 문의",status:"OPEN",createdAt:"2026-11-20T15:00:00",contentExpired:false,imageAvailable:false});
  await click("새로고침"); await wait("document.querySelectorAll('.sc-history-list .sc-ticket-row').length===12"); await click("다음", ".sc-pages button"); await wait("document.querySelectorAll('.sc-history-list .sc-ticket-row').length===2");
  await click("문의 남기기", ".sc-guest-tabs button"); await type("input[aria-label='문의 제목']", "새로 접수한 로그인 문의"); await type("textarea", "로그인에 대해 새로 문의해요."); await sendForm();
  await wait("window.route.includes('inquiry=') && document.querySelector('.sc-detail-card h2')"); await click("이 브라우저의 문의", ".sc-guest-tabs button");
  await wait("document.querySelectorAll('.sc-history-list .sc-ticket-row').length===12"); assert.equal(await evaluate("document.querySelector('.sc-pages span').textContent"), "1 페이지"); assert.match(await evaluate("document.querySelector('.sc-history-list .sc-ticket-row').textContent"), /새로 접수한 로그인 문의/); checks.push("new guest inquiry resets a previously paged history to first page");
  const deniedViews=state.guestViews; state.denyGuestView=true; await navigate(`/support/login-help?tab=history&inquiry=${guestId}`); await wait("document.querySelector('[role=alert]')?.textContent.includes('조회 권한을 다시')");
  await new Promise(resolve=>setTimeout(resolve,250)); assert.equal(state.guestViews,deniedViews+1); state.denyGuestView=false; await click("다시 시도"); await wait("document.querySelector('.sc-detail-card h2')"); checks.push("guest detail denial stops retries until explicit retry");
  await navigate(`/support/login-help?tab=history&inquiry=${guestId}`); await wait("document.querySelector('.sc-detail-card h2')");
  state.guestActive = false; await click("이 브라우저의 문의", ".sc-guest-tabs button"); await wait("document.querySelector('.sc-empty-card')"); assert.equal(await evaluate("document.querySelectorAll('.sc-ticket-row').length"), 0); checks.push("expired guest cookie hides old history and offers new inquiry");
  state.guestActive = true; await navigate("/support/login-help?inquiry=999999"); await wait("document.querySelector('[role=alert]')?.textContent.includes('접근할 수 없는')");
  const viewsBefore = state.guestViews; await new Promise(resolve => setTimeout(resolve, 250)); assert.equal(state.guestViews, viewsBefore); checks.push("foreign or missing guest inquiry fails safely without retry loop");
  await writeFile(resolve(destination, "browser-results.json"), JSON.stringify({ passed: checks.length, checks }, null, 2)); console.log(JSON.stringify({ passed: checks.length, checks }, null, 2));
} finally { if (browser) await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
