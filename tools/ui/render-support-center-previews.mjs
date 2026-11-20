import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// 기존 제품 폼·상세를 사용하되 외부 전송은 대체한다. 새 임시 Chrome 프로필만 연결한다.
const root = resolve(import.meta.dirname, "../.."), destination = resolve(root, "build/support-center-previews");
await mkdir(destination, { recursive: true });
const source = await readFile(resolve(root, "src/main/java/shop/esjh/memoryjar/service/support/SupportFaqService.java"), "utf8");
const faq = source.split(/\r?\n/).filter(line => line.includes("new Faq(")).map(line => {
  const [id, category, question, answer] = [...line.matchAll(/"(?:[^"\\]|\\.)*"/g)].map(match => JSON.parse(match[0]));
  return { id, category, question, answer };
});
assert.equal(faq.length, 8, "Read current server FAQ, not invented content");
const require = createRequire(resolve(root, "frontend/package.json"));
const { build } = await import(pathToFileURL(require.resolve("vite")).href);
const { default: react } = await import(pathToFileURL(require.resolve("@vitejs/plugin-react")).href);
const { default: tailwindcss } = await import(pathToFileURL(require.resolve("@tailwindcss/vite")).href);
const mockApi = `
const ticket={inquiryId:128,category:'PHOTO_UPLOAD',title:'사진을 추가하다가 업로드가 멈췄어요',description:'쪽지를 쓰면서 사진 두 장을 추가했는데 한 장이 계속 준비 중으로 보여요.',status:'WAITING_USER',createdAt:'2026-11-20T14:10:00',contentExpired:false,imageAvailable:false};
const messages=[{messageId:1,role:'OPERATOR',content:'어느 화면에서 멈췄는지 확인하고 있어요. 같은 화면을 다시 열었을 때도 문제가 나타나는지 알려주실 수 있을까요? 가능하면 화면 캡처도 함께 남겨주세요.',createdAt:'2026-11-20T14:30:00'}];
const records=new Map();
function record(id,mode={}){const key=(mode.guest?'guest:':'user:')+id;if(!records.has(key)){const value={...ticket,inquiryId:Number(id)};
if(mode.guest){value.category='LOGIN_ACCOUNT';value.title=Number(id)===127?'기존 계정의 로그인 방법을 확인하고 싶어요':'네이버 로그인 후 처음 화면으로 돌아와요';value.description='네이버 로그인을 마치면 다시 로그인 전 화면으로 돌아와요. 같은 브라우저에서 여러 번 시도해도 동일해요.';if(Number(id)===127)value.status='RESOLVED';}
else if(Number(id)===127){value.title='저금통 초대 링크를 확인하고 싶어요';value.category='INVITE_ACCESS';value.status='ANSWERED';}else if(Number(id)===126){value.title='AI 꾸미기 결과에 대해 문의드려요';value.category='AI_GENERATION';value.status='OPEN';}records.set(key,value);}return records.get(key);}
window.previewSends=0;
export const getSupportView=async(id,mode={})=>({inquiry:{...record(id,mode)},messages:{items:[...messages],nextBefore:null},attachments:[]});
export const getSupportMessages=async()=>({items:[],nextBefore:null});
export const sendSupportMessage=async(id,request,mode={})=>{window.previewSends++;const item={messageId:messages.length+1,role:'USER',content:request.content,createdAt:'2026-11-20T15:00:00'};messages.push(item);record(id,mode).status='IN_PROGRESS';return item;};
export const resolveSupportInquiry=async(id,resolved,mode={})=>({...record(id,mode),status:record(id,mode).status=resolved?'RESOLVED':'IN_PROGRESS'});
export const startSupportReview=async()=>ticket;
export const createGeneralSupportInquiry=async request=>{window.previewSends++;return {...request,inquiryId:129,status:'OPEN',createdAt:'2026-11-20T15:00:00'};};
export const uploadSupportScreenshot=async()=>({attachmentId:1});
export const getSupportImage=async()=>{throw new Error('예시에는 원본 파일이 없어요.');};
export const getSupportAttachmentImage=getSupportImage;
export const supportError=error=>error.message||'예시 화면 오류';
`;
const output = await build({ root: resolve(root, "frontend"), configFile: false, logLevel: "warn",
  define: { "process.env.NODE_ENV": '"production"' }, plugins: [react(), tailwindcss(), {
    name: "preview-without-external-support-api", enforce: "pre",
    resolveId(id) { if (id.endsWith("/api/supportApi")) return "\0support-preview-api"; if (id.endsWith("/realtime/useUserStateRefresh")) return "\0support-preview-realtime"; },
    load(id) { if (id === "\0support-preview-api") return mockApi; if (id === "\0support-preview-realtime") return "export const useUserStateRefresh=()=>{};"; }
  }], resolve: { alias: ["react", "react-dom", "react-router-dom"].map(name => ({ find: new RegExp(`^${name}(?=/|$)`), replacement: resolve(root, "frontend/node_modules", name) })) },
  build: { write: false, minify: true, lib: { entry: resolve(root, "tools/ui/support-center-preview.jsx"), formats: ["es"], fileName: "support-preview" } } });
const chunks = Array.isArray(output) ? output.flatMap(result => result.output) : output.output;
const assets = new Map(chunks.map(item => ["/" + item.fileName, item.type === "chunk" ? item.code : item.source]));
const entry = chunks.find(item => item.type === "chunk" && item.isEntry).fileName;
const links = chunks.filter(item => item.fileName.endsWith(".css")).map(item => `<link rel="stylesheet" href="/${item.fileName}">`).join("");
const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' blob: data:; connect-src 'self'"><title>Memory Jar 도움말·문의 화면 예시</title>${links}</head><body><div id="root"></div><script>window.supportPreviewFaq=${JSON.stringify(faq).replaceAll("<", "\\u003c")}</script><script type="module" src="/${entry}"></script></body></html>`;
for (const [name, content] of assets) await writeFile(resolve(destination, name.slice(1)), content);
await writeFile(resolve(destination, "index.html"), html);
let unexpectedApiCalls = 0;
const server = createServer(async (request, response) => {
  try {
    const path = new URL(request.url, "http://localhost").pathname;
    if (path.startsWith("/api/")) { unexpectedApiCalls++; response.writeHead(403); response.end(); return; }
    if (assets.has(path)) { response.writeHead(200, { "Content-Type": path.endsWith(".css") ? "text/css" : "text/javascript" }); response.end(assets.get(path)); return; }
    if (path === "/fonts/pretendard/PretendardVariable-1.3.9.woff2") { response.writeHead(200, { "Content-Type": "font/woff2" }); response.end(await readFile(resolve(root, "frontend/public", path.slice(1)))); return; }
    if (path !== "/" && path !== "/index.html") { response.writeHead(404); response.end(); return; }
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); response.end(html);
  } catch { response.writeHead(500); response.end(); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const address = `http://127.0.0.1:${server.address().port}`;
let child, socket;
const results = [];
try {
  const profile = await mkdtemp(resolve(destination, "chrome-profile-"));
  child = spawn(process.env.MEMORYJAR_TEST_CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe", ["--headless=new", "--remote-debugging-port=0", "--remote-debugging-address=127.0.0.1", `--user-data-dir=${profile}`, "--hide-scrollbars", "--disable-background-networking", "--disable-component-update", "--disable-sync", "--disable-extensions", "--no-first-run", "--no-default-browser-check", "--disable-gpu", "--no-proxy-server", "about:blank"], { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
  const endpoint = await new Promise((resolve, reject) => {
    let stderr = ""; const timer = setTimeout(() => reject(new Error("Chrome start timeout")), 20000);
    child.stderr.on("data", chunk => { stderr += chunk; const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/); if (match) { clearTimeout(timer); resolve(match[1]); } });
    child.once("error", error => { clearTimeout(timer); reject(error); }); child.once("exit", code => { clearTimeout(timer); reject(new Error(`Chrome exit ${code}`)); });
  });
  socket = new WebSocket(endpoint); await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }); });
  let counter = 0; const pending = new Map();
  socket.addEventListener("message", event => { const message = JSON.parse(event.data), task = pending.get(message.id); if (task) { pending.delete(message.id); clearTimeout(task.timer); message.error ? task.reject(new Error(message.error.message)) : task.resolve(message.result); } });
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => { const id = ++counter, timer = setTimeout(() => { pending.delete(id); reject(new Error(`${method} timeout`)); }, 10000); pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params, sessionId })); });
  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  const evaluate = async expression => { const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }, sessionId); if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails)); return result.result.value; };
  const wait = async expression => { for (let i = 0; i < 100; i++) { if (await evaluate(`Boolean(${expression})`)) return; await new Promise(resolve => setTimeout(resolve, 60)); } throw new Error(`Wait failed: ${expression}`); };
  const setInput = (selector, value) => evaluate(`(()=>{const item=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(Object.getPrototypeOf(item),'value').set.call(item,${JSON.stringify(value)});item.dispatchEvent(new Event(item.tagName==='SELECT'?'change':'input',{bubbles:true}));})()`);
  const capture = async name => {
    await evaluate("document.fonts.ready.then(()=>true)"); await evaluate("document.activeElement?.blur()");
    assert.equal(await evaluate("document.documentElement.scrollWidth<=innerWidth"), true, `${name} no horizontal overflow`);
    const metrics = await send("Page.getLayoutMetrics", {}, sessionId), width = await evaluate("innerWidth");
    const screenshot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, clip: { x: 0, y: 0, width, height: Math.ceil(metrics.cssContentSize.height), scale: 1 } }, sessionId);
    await writeFile(resolve(destination, name), Buffer.from(screenshot.data, "base64"));
  };
  await send("Page.enable", {}, sessionId);
  for (const width of [1440, 390]) for (const screen of ["help", "inquiries", "empty", "new", "login", "detail"]) {
    await send("Emulation.setDeviceMetricsOverride", { width, height: 1050, deviceScaleFactor: 1, mobile: width < 700 }, sessionId);
    await send("Page.navigate", { url: `${address}/?screen=${screen}` }, sessionId);
    await wait(`document.querySelector('.support-center-preview')?.dataset.screen==='${screen}'`);
    if (screen === "detail") await wait("document.querySelector('.support-letter-detail h2')");
    if (["new", "login"].includes(screen)) {
      if (screen === "new") await setInput("select", "PHOTO_UPLOAD");
      await setInput("input[aria-label='문의 제목']", screen === "new" ? "사진을 추가하다가 업로드가 멈췄어요" : "네이버 로그인 후 처음 화면으로 돌아와요");
      await setInput("textarea", screen === "new" ? "쪽지를 쓰면서 사진 두 장을 추가했는데 한 장이 계속 준비 중으로 보여요. 같은 화면을 다시 열어도 반복돼요." : "네이버로 로그인을 마치면 다시 로그인 전 화면으로 돌아와요. 같은 브라우저에서 여러 번 시도해도 동일해요.");
      await wait("!document.querySelector('button[type=submit]').disabled");
      if (width < 700) assert.ok(await evaluate("document.querySelector('textarea').getBoundingClientRect().width>=innerWidth-100"), "Mobile form uses a full-width input column");
    }
    await capture(`${screen}-${width}.png`);
    if (screen === "help") {
      await setInput("input[type=search]", "검색결과가없는예시"); await wait("document.querySelector('.sc-no-results')");
      await setInput("input[type=search]", "");
      await evaluate("document.querySelectorAll('.sc-topic-filters button')[1].click()"); await wait("document.querySelectorAll('.sc-faq-list details').length===1");
    }
    if (["new", "login"].includes(screen)) {
      await evaluate("document.querySelector('form').requestSubmit()"); await wait("document.querySelector('.sc-preview-feedback')"); assert.equal(await evaluate("window.previewSends"), 1);
    }
    if (screen === "login") {
      await evaluate("document.querySelectorAll('.sc-guest-tabs button')[1].click()"); await wait("document.querySelector('.sc-guest-history')");
      await capture(`login-history-${width}.png`);
      await evaluate("document.querySelector('.sc-guest-ticket').click()"); await wait("document.querySelector('.support-letter-detail h2')");
    }
    if (screen === "inquiries") {
      await evaluate("document.querySelector('.sc-ticket-row').click()"); await wait("document.querySelector('.support-letter-detail h2')");
    }
    results.push({ screen, width, rendered: true, overflow: false });
    console.log(`Rendered and checked: ${screen}-${width}`);
  }
  assert.equal(unexpectedApiCalls, 0, "No real API calls from preview components");
  await writeFile(resolve(destination, "results.json"), JSON.stringify({ renders: results.length, unexpectedApiCalls, results }, null, 2));
  await send("Browser.close");
} finally { socket?.close(); if (child && child.exitCode === null) child.kill(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
