import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { extname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

// 실제 사용자 브라우저·쿠키와 분리한 로컬 React 예시를 빌드하고 캡처한다.
const root = resolve(import.meta.dirname, "../..");
const destination = resolve(root, "build/operator-inbox-previews");
const require = createRequire(resolve(root, "frontend/package.json"));
const { build } = await import(pathToFileURL(require.resolve("vite")).href);
const { default: react } = await import(pathToFileURL(require.resolve("@vitejs/plugin-react")).href);
const { default: tailwindcss } = await import(pathToFileURL(require.resolve("@tailwindcss/vite")).href);
await mkdir(destination, { recursive: true });
const output = await build({ root: resolve(root, "frontend"), configFile: false, logLevel: "warn",
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  plugins: [react(), tailwindcss()],
  resolve: { alias: ["react", "react-dom", "react-router-dom"].map(name => ({ find: new RegExp(`^${name.replaceAll("/", "\\/")}(?=\\/|$)`), replacement: resolve(root, "frontend/node_modules", name) })) },
  build: { write: false, minify: true, lib: { entry: resolve(root, "tools/ui/operator-inbox-preview.jsx"), formats: ["es"], fileName: "preview" } },
});
const chunks = Array.isArray(output) ? output.flatMap(result => result.output) : output.output;
const assets = new Map(chunks.map(item => ["/" + item.fileName, item.type === "chunk" ? item.code : item.source]));
const entry = chunks.find(item => item.type === "chunk" && item.isEntry).fileName;
const css = chunks.filter(item => item.fileName.endsWith(".css")).map(item => `<link rel="stylesheet" href="/${item.fileName}">`).join("");
const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Memory Jar 운영 문의함 예시</title>${css}</head><body><div id="root"></div><script type="module" src="/${entry}"></script></body></html>`;
for (const [name, content] of assets) await writeFile(resolve(destination, name.slice(1)), content);
await writeFile(resolve(destination, "index.html"), html);
const server = createServer(async (request, response) => {
  try {
    const path = new URL(request.url, "http://localhost").pathname;
    const types = { ".css": "text/css", ".js": "text/javascript", ".mjs": "text/javascript", ".woff2": "font/woff2" };
    if (assets.has(path)) { response.writeHead(200, { "Content-Type": types[extname(path)] || "application/octet-stream" }); response.end(assets.get(path)); return; }
    if (path === "/fonts/pretendard/PretendardVariable-1.3.9.woff2") {
      response.writeHead(200, { "Content-Type": "font/woff2" }); response.end(await readFile(resolve(root, "frontend/public", path.slice(1)))); return;
    }
    if (path !== "/" && path !== "/index.html") { response.writeHead(404); response.end(); return; }
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); response.end(html);
  } catch { response.writeHead(500); response.end(); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const address = `http://127.0.0.1:${server.address().port}`;
// Windows Chrome의 최소 창 폭과 무관하게 실제 CSS 뷰포트를 지정한다.
// 연결 대상은 바로 위 도구가 새 임시 프로필로 띄운 브라우저 한 개뿐이다.
let child, socket;
try {
  const profile = await mkdtemp(resolve(destination, "chrome-profile-"));
  const chrome = process.env.MEMORYJAR_TEST_CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
  child = spawn(chrome, ["--headless=new", "--remote-debugging-port=0", "--remote-debugging-address=127.0.0.1", `--user-data-dir=${profile}`,
    "--hide-scrollbars", "--disable-background-networking", "--disable-component-update", "--disable-sync", "--disable-extensions", "--no-first-run", "--no-default-browser-check", "--disable-gpu", "--no-proxy-server", "about:blank"], { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
  const endpoint = await new Promise((resolve, reject) => {
    let stderr = "";
    const timer = setTimeout(() => reject(new Error("Isolated Chrome did not start")), 20000);
    child.stderr.on("data", chunk => { stderr += chunk; const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/); if (match) { clearTimeout(timer); resolve(match[1]); } });
    child.once("error", error => { clearTimeout(timer); reject(error); });
    child.once("exit", code => { clearTimeout(timer); reject(new Error(`Chrome exit ${code}: ${stderr.slice(-500)}`)); });
  });
  socket = new WebSocket(endpoint);
  await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }); });
  let nextId = 0;
  const pending = new Map();
  socket.addEventListener("message", event => {
    const message = JSON.parse(event.data), task = pending.get(message.id);
    if (task) { pending.delete(message.id); clearTimeout(task.timer); message.error ? task.reject(new Error(message.error.message)) : task.resolve(message.result); }
  });
  function send(method, params = {}, sessionId) {
    return new Promise((resolve, reject) => {
      const id = ++nextId, timer = setTimeout(() => { pending.delete(id); reject(new Error(`${method} timed out`)); }, 10000);
      pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params, sessionId }));
    });
  }
  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  const evaluate = async expression => {
    const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }, sessionId);
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
  };
  await send("Page.enable", {}, sessionId);
  for (const [variant, width, height] of [["cards", 1440, 1100], ["table", 1440, 1100], ["split", 1440, 1200], ["cards", 390, 1000], ["table", 390, 1000], ["split", 390, 1000]]) {
    await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 700 }, sessionId);
    await send("Page.navigate", { url: `${address}/?variant=${variant}` }, sessionId);
    let ready = false;
    for (let attempt = 0; attempt < 80 && !ready; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 100));
      ready = await evaluate(`document.documentElement.dataset.previewReady === 'true' && location.search.includes('variant=${variant}')`);
    }
    assert.equal(ready, true, "React and local font finished loading");
    assert.equal(await evaluate("innerWidth"), width, "Actual CSS viewport matches screenshot");
    assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth"), true, "No horizontal overflow");
    const metrics = await send("Page.getLayoutMetrics", {}, sessionId);
    const capture = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, clip: { x: 0, y: 0, width, height: Math.ceil(metrics.cssContentSize.height), scale: 1 } }, sessionId);
    const filename = `${variant}-${width}.png`;
    await writeFile(resolve(destination, filename), Buffer.from(capture.data, "base64"));
    // 필터·문의 선택도 실제 React 이벤트로 확인한다. 운영 요청은 발생하지 않는다.
    await evaluate("document.querySelectorAll('.preview-filters button')[1].click()");
    await new Promise(resolve => setTimeout(resolve, 80));
    assert.equal(await evaluate("document.querySelector('.preview-list-caption strong').textContent"), "1건");
    await evaluate("document.querySelector('.preview-ticket,.preview-table-title,.preview-list-item').click()");
    await new Promise(resolve => setTimeout(resolve, 80));
    assert.equal(await evaluate("Boolean(document.querySelector('.preview-detail textarea'))"), true);
    console.log(`Rendered and checked viewport, filter, detail: ${filename}`);
  }
  await send("Browser.close");
} finally {
  socket?.close();
  if (child && child.exitCode === null) child.kill();
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
}
