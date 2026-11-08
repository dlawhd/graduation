/** 실제 React Hook·App·Axios 인터셉터에 늦은 응답을 주입한다. 네트워크와 WebSocket은 외부로 보내지 않는다. */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const assert = require("node:assert/strict");
const base = process.env.TEST_BASE_URL || "http://127.0.0.1:3001";
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true,
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const results = [];
  try {
    for (const mode of ["hooks", "auth", "app", "app-mobile"]) {
      const context = await browser.newContext({ viewport: { width: mode === "app-mobile" ? 390 : 1280, height: 900 } });
      await context.route("**/*", route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
      await context.routeWebSocket("**/*", socket => {
        // Vite의 로컬 HMR 연결만 허용한다. 실제 앱의 외부 STOMP 연결은 차단한다.
        if (new URL(socket.url()).host === new URL(base).host) socket.connectToServer();
        else socket.close();
      });
      const page = await context.newPage(); const errors = [];
      page.on("pageerror", e => { if (errors.length < 5) errors.push(e.stack || e.message); });
      await page.goto(`${base}/tests/request-races.html?mode=${mode === "app-mobile" ? "app" : mode}`);
      await page.waitForFunction(() => window.race);
      const pending = () => page.evaluate(() => window.race.pending());
      const respond = (i, data, status = 200) => page.evaluate(({i, data, status}) => window.race.respond(i, data, status), {i, data, status});
      if (mode === "hooks") {
        await page.waitForFunction(() => window.race.pending().length >= 4 && window.race.switchJar);
        const old = await pending();
        await page.evaluate(() => window.race.switchJar("2"));
        await page.waitForFunction(() => window.race.pending().some(r => r.url === "/api/v1/jars/2/invites"));
        const fresh = (await pending()).filter(r => r.index >= old.length);
        for (const r of fresh) await respond(r.index, payload(r.url, 2));
        await page.waitForFunction(() => JSON.parse(document.querySelector("#snapshot").textContent).jar?.jarId === 2);
        for (const r of old) await respond(r.index, payload(r.url, 1));
        await delay(100);
        let snapshot = JSON.parse(await page.locator("#snapshot").textContent());
        assert.equal(snapshot.jar.jarId, 2); assert.equal(snapshot.members[0].userId, 2); assert.equal(snapshot.invites[0].inviteId, 2);
        const before = (await pending()).length;
        await page.evaluate(() => { window.race.reload(); window.race.reload(); });
        await page.waitForFunction(n => window.race.pending().length >= n + 6, before);
        const more = (await pending()).slice(before);
        for (const r of more.slice(3)) await respond(r.index, payload(r.url, 22));
        for (const r of more.slice(0, 3)) await respond(r.index, {}, 500);
        await page.waitForFunction(() => !JSON.parse(document.querySelector("#snapshot").textContent).loading);
        snapshot = JSON.parse(await page.locator("#snapshot").textContent());
        assert.equal(snapshot.jar.jarId, 22); assert.deepEqual(snapshot.errors, ["", "", ""]);
        results.push("저금통 A→B 응답 역전 및 같은 화면의 최신 요청 보호");
      } else if (mode === "auth") {
        await page.evaluate(() => {
          window.events = 0; window.addEventListener("memoryjar:session-expired", () => window.events++);
          window.done = [];
          for (let i = 0; i < 3; i++) window.race.request("/fixture-" + i).then(() => window.done.push("ok"), e => window.done.push(e.code));
        });
        await page.waitForFunction(() => window.race.pending().length === 3);
        for (const r of await pending()) await respond(r.index, {}, 401);
        await page.waitForFunction(() => window.race.pending().some(r => r.url === "/api/v1/me"));
        await respond((await pending()).find(r => r.url === "/api/v1/me").index, {}, 401);
        await page.waitForFunction(() => window.race.pending().some(r => r.url.endsWith("/refresh")));
        assert.equal((await pending()).filter(r => r.url.endsWith("/refresh")).length, 1);
        await page.evaluate(() => window.race.beginAuthChange());
        const refresh = (await pending()).find(r => r.url.endsWith("/refresh"));
        await respond(refresh.index, { ok: true });
        await page.waitForFunction(() => window.done.length === 3);
        assert.deepEqual(await page.evaluate(() => window.done), ["ERR_CANCELED", "ERR_CANCELED", "ERR_CANCELED"]);
        assert.equal(await page.evaluate(() => window.events), 0);
        assert.equal((await pending()).filter(r => r.url.startsWith("/fixture-")).length, 3);
        await page.evaluate(() => { window.race.finishAuthChange(); window.late = "waiting"; window.race.request("/late-old").catch(e => window.late = e.code); });
        await page.waitForFunction(() => window.race.pending().some(r => r.url === "/late-old"));
        await page.evaluate(() => { window.race.beginAuthChange(); window.race.finishAuthChange(); });
        const old = (await pending()).find(r => r.url === "/late-old");
        await respond(old.index, {}, 401);
        await page.waitForFunction(() => window.late === "ERR_CANCELED");
        assert.equal((await pending()).filter(r => r.url.endsWith("/refresh")).length, 1);
        const expiryStart = (await pending()).length;
        await page.evaluate(() => {
          window.expired = [];
          for (let i = 0; i < 3; i++) window.race.request("/expired-" + i)
            .catch(e => window.expired.push({ code: e.code, reason: e.authReason }));
        });
        await page.waitForFunction(n => window.race.pending().length >= n + 3, expiryStart);
        for (const r of (await pending()).slice(expiryStart)) await respond(r.index, {}, 401);
        await page.waitForFunction(n => window.race.pending().slice(n).some(r => r.url === "/api/v1/me"), expiryStart);
        await respond((await pending()).slice(expiryStart).find(r => r.url === "/api/v1/me").index, {}, 401);
        await page.waitForFunction(() => window.race.pending().filter(r => r.url.endsWith("/refresh")).length === 2);
        const expiredRefresh = (await pending()).filter(r => r.url.endsWith("/refresh")).at(-1);
        await respond(expiredRefresh.index, {}, 401);
        await page.waitForFunction(() => window.race.pending().filter(r => r.url === "/api/v1/me").length === 3);
        await respond((await pending()).filter(r => r.url === "/api/v1/me").at(-1).index, {}, 401);
        await page.waitForFunction(() => window.expired.length === 3);
        assert.equal(await page.evaluate(() => window.events), 1);
        assert.equal(await page.evaluate(() => window.expired.filter(e => e.reason === "SESSION_EXPIRED").length), 1);
        results.push("401 병합·로그아웃 중 갱신 취소·이전 계정 401 재시도 차단");
      } else {
        await page.getByRole("button", {name: "알림 열기", exact: true}).waitFor();
        await page.getByRole("button", {name: "알림 열기", exact: true}).click();
        await page.waitForFunction(() => window.race.pending().some(r => r.url === "/api/v1/notifications"));
        const old = await pending();
        await page.evaluate(() => {
          window.dispatchEvent(new Event("memoryjar:session-expired")); window.activeAccount = 2;
          window.race.navigate("/fixture-account-b");
        });
        await page.getByRole("button", {name: "알림 열기", exact: true}).waitFor();
        await page.getByRole("button", {name: "알림 열기", exact: true}).click();
        await page.waitForFunction(n => window.race.pending().filter(r => r.url === "/api/v1/notifications").length >= 2, old.length);
        const fresh = (await pending()).filter(r => r.index >= old.length);
        for (const r of fresh) await respond(r.index, r.url.endsWith("unread-count") ? {unreadCount: 2} : {items: []});
        for (const r of old) await respond(r.index, r.url.endsWith("unread-count") ? {unreadCount: 99} : {items: [{notificationId: 1, message: "이전 계정 비공개 알림", content: "이전 계정 비공개 알림"}]});
        await page.getByText("안 읽은 알림 2개", {exact: true}).waitFor();
        assert.equal(await page.getByText("이전 계정 비공개 알림", {exact: true}).count(), 0);
        results.push(`${mode}: 실제 App 계정 변경 뒤 이전 알림 목록·개수 응답 차단`);
      }
      assert.deepEqual(errors, [], mode + ": 브라우저 실행 오류"); await context.close();
    }
    console.log(JSON.stringify({ passed: results }, null, 2));
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
function payload(url, id) {
  if (url.endsWith("members")) return {items: [{userId: id, name: "시험", role: "OWNER"}]};
  if (url.endsWith("invites")) return {items: [{inviteId: id, code: "fixture", isActive: true}]};
  if (url.endsWith("/me")) return {userId: id};
  return {jarId: id, name: "시험"};
}
