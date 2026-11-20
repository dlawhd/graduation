import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

/** 새 임시 프로필의 Chrome만 제어한다. 실제 사용자 창·프로필·운영 로그인에는 연결하지 않는다. */
export async function openSupportTestBrowser(directory) {
  const profile = await mkdtemp(resolve(directory, "profile-"));
  const child = spawn(process.env.MEMORYJAR_TEST_CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe", ["--headless=new", "--remote-debugging-port=0", "--remote-debugging-address=127.0.0.1", `--user-data-dir=${profile}`, "--hide-scrollbars", "--disable-background-networking", "--disable-component-update", "--disable-sync", "--disable-extensions", "--no-first-run", "--no-default-browser-check", "--disable-gpu", "--no-proxy-server", "about:blank"], { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
  let socket;
  try {
    const endpoint = await new Promise((resolve, reject) => {
      let stderr = ""; const timer = setTimeout(() => reject(new Error("Isolated Chrome start timeout")), 20000);
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
    await send("Page.enable", {}, sessionId);
    return {
      evaluate,
      navigate: url => send("Page.navigate", { url }, sessionId),
      async wait(expression) { for (let i = 0; i < 120; i++) { if (await evaluate(`Boolean(${expression})`)) return; await new Promise(resolve => setTimeout(resolve, 60)); } throw new Error(`Wait failed: ${expression}`); },
      viewport: (width, height = 1050) => send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 700 }, sessionId),
      async capture(name, width) {
        await this.viewport(width); await evaluate("document.fonts.ready.then(()=>true)"); await evaluate("document.activeElement?.blur()");
        assert.equal(await evaluate("document.documentElement.scrollWidth<=innerWidth"), true, `${name} has no horizontal overflow`);
        const metrics = await send("Page.getLayoutMetrics", {}, sessionId), shot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, clip: { x: 0, y: 0, width, height: Math.ceil(metrics.cssContentSize.height), scale: 1 } }, sessionId);
        await writeFile(resolve(directory, name), Buffer.from(shot.data, "base64"));
      },
      async close() { try { await send("Browser.close"); } finally { socket.close(); if (child.exitCode === null) child.kill(); } },
    };
  } catch (error) { socket?.close(); child.kill(); throw error; }
}
