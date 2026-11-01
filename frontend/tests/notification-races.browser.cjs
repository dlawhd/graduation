/** 실제 App에 읽음 응답과 가짜 STOMP 알림을 역순으로 전달한다. 외부 서비스에는 연결하지 않는다. */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const assert = require("node:assert/strict");
const base = process.env.TEST_BASE_URL || "http://127.0.0.1:3001";
const delay = ms => new Promise(r => setTimeout(r, ms));
async function until(test) {
  const deadline = Date.now() + 10000;
  while (!test()) { if (Date.now() > deadline) throw new Error("fixture wait timeout"); await delay(10); }
}
(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true,
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const passed = [];
  try {
    for (const width of [1280, 390]) {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      const peers = []; let messageId = 0;
      await context.route("**/*", route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
      await context.routeWebSocket("**/*", socket => {
        if (new URL(socket.url()).host === new URL(base).host) { socket.connectToServer(); return; }
        const subscriptions = new Map(); peers.push({ socket, subscriptions });
        socket.onMessage(message => {
          const text = String(message);
          const frame = text.split("\n")[0];
          const headers = Object.fromEntries(text.split("\n").slice(1).filter(x => x.includes(":"))
            .map(x => [x.slice(0, x.indexOf(":")), x.slice(x.indexOf(":") + 1)]));
          if (frame === "CONNECT" || frame === "STOMP") socket.send("CONNECTED\nversion:1.2\nheart-beat:0,0\n\n\0");
          if (frame === "SUBSCRIBE") subscriptions.set(headers.id, headers.destination);
          if (frame === "UNSUBSCRIBE") subscriptions.delete(headers.id);
          if (frame === "DISCONNECT" && headers.receipt) socket.send(`RECEIPT\nreceipt-id:${headers.receipt}\n\n\0`);
        });
      });
      const page = await context.newPage(); const errors = [];
      page.on("pageerror", e => errors.push(e.message));
      await page.goto(base + "/tests/request-races.html?mode=app");
      await page.getByRole("button", { name: "알림 열기", exact: true }).waitFor();
      const requests = () => page.evaluate(() => window.race.pending());
      const respond = (i, data) => page.evaluate(({i, data}) => window.race.respond(i, data, 200), {i, data});
      const items = Array.from({ length: 5 }, (_, i) => ({notificationId: i + 1, message: `알림${i + 1}`,
        content: `알림${i + 1}`, isRead: false, createdAt: new Date().toISOString()}));
      for (const r of await requests()) if (r.url.endsWith("unread-count")) await respond(r.index, { unreadCount: 5 });
      await page.getByRole("button", {name: "알림 열기", exact: true}).click();
      await page.waitForFunction(() => window.race.pending().some(r => r.url === "/api/v1/notifications"));
      for (const r of await requests()) await respond(r.index, r.url.endsWith("unread-count") ? { unreadCount: 5 } : {items});
      await page.getByText("안 읽은 알림 5개", {exact: true}).waitFor();

      // 모두 읽기 이전의 GET이 나중에 도착해도 이미 확인한 새 결과를 덮지 않는다.
      const beforeFocus = (await requests()).length;
      await page.evaluate(() => window.dispatchEvent(new Event("focus")));
      await page.waitForFunction(n => window.race.pending().length > n, beforeFocus);
      const stale = (await requests()).at(-1);
      await page.getByRole("button", {name: "모두 읽음", exact: true}).click();
      await page.waitForFunction(() => window.race.pending().some(r => r.url.endsWith("read-all")));
      const write = (await requests()).find(r => r.url.endsWith("read-all"));
      await respond(write.index, {readAt: new Date().toISOString()});
      await page.waitForFunction(n => window.race.pending().length >= n + 3, write.index);
      const readItems = items.map(i => ({...i, isRead: true}));
      for (const r of (await requests()).filter(r => r.index > write.index))
        await respond(r.index, r.url.endsWith("unread-count") ? {unreadCount: 0} : {items: readItems});
      await page.getByText("안 읽은 알림 0개", {exact: true}).waitFor();
      await respond(stale.index, {unreadCount: 5}); await delay(100);
      assert.equal(await page.getByText("안 읽은 알림 0개", {exact: true}).count(), 1);

      await until(() => peers.some(p => [...p.subscriptions.values()].includes("/topic/users/1/notifications")));
      const send = notification => {
        for (const peer of peers) for (const [id, destination] of peer.subscriptions) {
          if (destination === "/topic/users/1/notifications") peer.socket.send(
            `MESSAGE\nsubscription:${id}\ndestination:${destination}\nmessage-id:${++messageId}\ncontent-type:application/json\n\n${JSON.stringify(notification)}\0`);
        }
      };
      const start = (await requests()).length;
      const newItem = {notificationId: 6, message: "새 알림6", content: "새 알림6", isRead: false, createdAt: new Date().toISOString()};
      send(items[0]); for (let i = 0; i < 10; i++) send(newItem);
      await page.waitForFunction(n => window.race.pending().length >= n + 2, start);
      const firstReads = (await requests()).slice(start);
      // 느린 재조회 중 추가 알림을 받아도 요청이 계속 병렬로 쌓이지 않는다.
      send(newItem); await delay(150);
      assert.equal((await requests()).length, start + 2);
      const finalItems = [newItem, ...readItems];
      for (const r of firstReads) await respond(r.index, r.url.endsWith("unread-count") ? {unreadCount: 99} : {items: []});
      await page.waitForFunction(n => window.race.pending().length >= n + 4, start);
      for (const r of (await requests()).slice(start + 2))
        await respond(r.index, r.url.endsWith("unread-count") ? {unreadCount: 1} : {items: finalItems});
      await page.getByText("안 읽은 알림 1개", {exact: true}).waitFor();
      assert.equal(await page.getByText("새 알림6", {exact: true}).count(), 1);
      assert.deepEqual(errors, []);
      passed.push({width, staleCountBlocked: true, duplicatedSocketEventSafe: true, burstRequests: 4});
      await context.close();
    }
    console.log(JSON.stringify({passed}, null, 2));
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
