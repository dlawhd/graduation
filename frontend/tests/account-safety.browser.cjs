/** 실제 목록 화면과 이용 안내 Provider에 계정 변경·늦은 오류를 전달하는 로컬 Chrome 검사다. */
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const assert = require("node:assert/strict");
const base = process.env.TEST_BASE_URL || "http://127.0.0.1:3001";
const delay = ms => new Promise(r => setTimeout(r, ms));
const progress = {version: 1, items: [{tutorialKey: "WELCOME", handled: false, status: null}]};
const item = name => ({jarId: 1, name, description: "계정의 비공개 설명", theme: "SPRING", myRole: "OWNER", memberCount: 1, maxMembers: 5, openAt: "2027-01-01T00:00:00+09:00"});
(async () => {
  const browser = await chromium.launch({channel: "chrome", headless: true});
  const passed = []; let lastPage;
  try {
    for (const width of [1280, 390]) {
      for (const mode of ["shelf", "onboarding"]) {
        const context = await browser.newContext({viewport: {width, height: 900}});
        await context.route("**/*", r => new URL(r.request().url()).origin === base ? r.continue() : r.abort());
        await context.routeWebSocket("**/*", s => new URL(s.url()).host === new URL(base).host ? s.connectToServer() : s.close());
        const page = await context.newPage(); lastPage = page; const errors = [];
        page.on("pageerror", e => errors.push(e.message));
        const requests = () => page.evaluate(() => window.fixture.pending());
        const respond = (index, data, status) => page.evaluate(({index, data, status}) => window.fixture.respond(index, data, status), {index, data, status});
        await page.goto(base + "/tests/account-safety.html?mode=" + mode);
        if (mode === "shelf") {
          await page.waitForFunction(() => Boolean(window.fixture.navigate));
          await page.evaluate(() => window.fixture.navigate("/jars"));
          await page.waitForFunction(() => window.fixture.pending().some(r => r.url === "/api/v1/jars"));
          const initial = (await requests()).find(r => r.url === "/api/v1/jars");
          await respond(initial.index, {items: [item("계정1 비공개 저금통")], page: 0, totalPages: 2, totalElements: 10});
          await page.getByText("계정1 비공개 저금통", {exact: true}).waitFor();
          // 목록 자체의 요청이 없는 동안 다른 API가 만료를 알아도 캐시된 카드를 즉시 숨긴다.
          await page.evaluate(() => { window.fixture.authChange(); window.dispatchEvent(new Event("memoryjar:session-expired")); });
          await page.getByText("로그인 시간이 지나 저금통 목록을 불러올 수 없어요.", {exact: false}).waitFor();
          assert.equal(await page.getByText("계정1 비공개 저금통", {exact: true}).count(), 0);
          assert.equal((await requests()).length, 1);
          // 별도 실행에서는 늦은 페이지 응답까지 겹쳐도 이전 목록이 돌아오지 않는지 확인한다.
          await page.goto(base + "/tests/account-safety.html?mode=shelf");
          await page.waitForFunction(() => Boolean(window.fixture.navigate));
          await page.evaluate(() => window.fixture.navigate("/jars"));
          await page.waitForFunction(() => window.fixture.pending().some(r => r.url === "/api/v1/jars"));
          await respond((await requests())[0].index, {items: [item("계정1 비공개 저금통")], page: 0, totalPages: 2, totalElements: 10});
          await page.getByText("계정1 비공개 저금통", {exact: true}).waitFor();
          await page.getByRole("button", {name: "다음", exact: false}).click();
          await page.waitForFunction(() => window.fixture.pending().filter(r => r.url === "/api/v1/jars").length === 2);
          const older = (await requests()).at(-1);
          await page.evaluate(() => { window.fixture.authChange(); window.dispatchEvent(new Event("memoryjar:session-expired")); });
          await page.getByText("로그인 시간이 지나 저금통 목록을 불러올 수 없어요.", {exact: false}).waitFor();
          await respond(older.index, {items: [item("늦은 계정1 목록")], page: 1, totalPages: 2});
          await delay(100);
          assert.equal(await page.getByText("계정1 비공개 저금통", {exact: true}).count(), 0);
          assert.equal(await page.getByText("늦은 계정1 목록", {exact: true}).count(), 0);
          assert.equal((await requests()).filter(r => r.url === "/api/v1/jars").length, 2);
        } else {
          await page.waitForFunction(() => window.fixture.pending().length === 1);
          await respond(0, progress);
          await page.waitForFunction(() => JSON.parse(document.querySelector("#snapshot").textContent).ready);
          await page.evaluate(() => { window.fixture.finish(); window.fixture.finish(); window.fixture.refresh(); });
          await page.waitForFunction(() => window.fixture.pending().some(r => r.method === "put") && window.fixture.pending().filter(r => r.method === "get").length === 2);
          const old = (await requests()).slice(1);
          assert.equal(old.filter(r => r.method === "put").length, 1);
          await page.evaluate(() => window.fixture.switchUser(2));
          await page.waitForFunction(n => window.fixture.pending().length > n, old.length + 1);
          const fresh = (await requests()).at(-1); await respond(fresh.index, progress);
          await page.waitForFunction(() => { const s = JSON.parse(document.querySelector("#snapshot").textContent); return s.userId === 2 && s.ready; });
          await page.evaluate(() => { window.fixture.finish(); });
          await page.waitForFunction(n => window.fixture.pending().length > n, fresh.index + 1);
          const freshWrite = (await requests()).at(-1);
          for (const r of old) await respond(r.index, r.method === "put" ? {} : progress, r.method === "put" ? 500 : 200);
          await page.waitForFunction(() => Boolean(window.fixture.oldError && window.fixture.oldRefreshError));
          let state = JSON.parse(await page.locator("#snapshot").textContent());
          assert.equal(state.error, ""); assert.equal(state.saving, "WELCOME"); assert.equal(state.handled, false);
          await respond(freshWrite.index, {tutorialKey: "WELCOME", handled: true, status: "COMPLETED"});
          await page.waitForFunction(() => { const s = JSON.parse(document.querySelector("#snapshot").textContent); return s.handled && s.saving === null; });
        }
        assert.deepEqual(errors, []);
        passed.push({width, mode}); await context.close();
      }
    }
    console.log(JSON.stringify({passed}, null, 2));
  } catch (e) { console.error((await lastPage?.locator("body").innerText())?.slice(0, 2600)); throw e; } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
