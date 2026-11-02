/** 실제 제작 화면·추억 뽑기 Hook에 늦은 응답을 넣어 PC와 모바일에서 회귀를 검사한다. */
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const assert = require("node:assert/strict");
const base = process.env.TEST_BASE_URL || "http://127.0.0.1:3001";
const delay = ms => new Promise(r => setTimeout(r, ms));
const currentCard = {hasTodayDraw: true, dailyDraw: {drawId: 91, drawDate: "2026-11-01"}};
(async () => {
  const browser = await chromium.launch({channel: "chrome", headless: true,
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"]});
  const passed = [];
  try {
    for (const width of [1280, 390]) {
      const context = await browser.newContext({viewport: {width, height: 900}});
      await context.route("**/*", route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
      await context.routeWebSocket("**/*", s => new URL(s.url()).host === new URL(base).host ? s.connectToServer() : s.close());
      const page = await context.newPage(); const errors = [];
      page.on("pageerror", e => errors.push(e.message));
      const pending = () => page.evaluate(() => window.fixture.pending());
      const respond = (index, data, status = 200) => page.evaluate(({index, data, status}) => window.fixture.respond(index, data, status), {index, data, status});
      const snapshot = async () => JSON.parse(await page.locator("#snapshot").textContent());
      const startDrawFixture = async () => {
        await page.goto(base + "/tests/round4-races.html?fixture=draw");
        await page.waitForFunction(() => window.fixture.pending().length === 1);
      };
      // 먼저 시작한 빈 조회나 실패가 최신 카드와 오류 상태를 지우지 못한다.
      for (const staleStatus of [200, 500]) {
        await startDrawFixture();
        await page.evaluate(() => { void window.fixture.today({silent: true}); });
        await page.waitForFunction(() => window.fixture.pending().length === 2);
        await respond(1, currentCard);
        await page.waitForFunction(() => JSON.parse(document.querySelector("#snapshot").textContent).today?.hasTodayDraw);
        await respond(0, {hasTodayDraw: false}, staleStatus); await delay(80);
        const s = await snapshot(); assert.equal(s.today.dailyDraw.drawId, 91); assert.equal(s.error, "");
        passed.push({width, scenario: "today-stale-" + staleStatus});
      }
      await startDrawFixture();
      await page.evaluate(() => { void window.fixture.refresh(); });
      await page.waitForFunction(() => window.fixture.pending().length === 2);
      await respond(0, {hasTodayDraw: false}); await delay(50);
      assert.equal((await snapshot()).loading, true);
      await respond(1, currentCard);
      await page.waitForFunction(() => !JSON.parse(document.querySelector("#snapshot").textContent).loading);
      assert.equal((await snapshot()).today.dailyDraw.drawId, 91);
      passed.push({width, scenario: "refresh-stale-finally"});
      // 오늘 카드가 먼저 끝나도 함께 불러오는 기록이 준비될 때까지 전체 로딩을 유지한다.
      await startDrawFixture();
      await page.evaluate(() => { window.fixture.deferHistory = true; void window.fixture.refresh(); });
      await page.waitForFunction(() => window.fixture.pending().length === 3);
      await respond(1, currentCard); await respond(0, {hasTodayDraw: false}); await delay(50);
      assert.equal((await snapshot()).loading, true);
      await respond(2, {items: [], page: 0, totalPages: 0});
      await page.waitForFunction(() => !JSON.parse(document.querySelector("#snapshot").textContent).loading);
      assert.equal((await snapshot()).today.dailyDraw.drawId, 91);
      passed.push({width, scenario: "today-does-not-finish-history-loading"});
      await startDrawFixture();
      await page.evaluate(() => window.fixture.closeJar());
      await page.waitForFunction(() => !JSON.parse(document.querySelector("#snapshot").textContent).loading);
      await respond(0, currentCard); await delay(50);
      assert.equal((await snapshot()).today, null);
      passed.push({width, scenario: "today-closed-jar"});
      // 같은 이벤트에서 두 번 눌러도 POST는 하나이며, 뽑기 전 조회가 성공한 카드를 되돌리지 않는다.
      await startDrawFixture();
      await page.evaluate(() => { void window.fixture.draw(); void window.fixture.draw(); });
      await page.waitForFunction(() => window.fixture.pending().some(r => r.method === "post"));
      let requests = await pending(); assert.equal(requests.filter(r => r.method === "post").length, 1);
      await respond(requests.find(r => r.method === "post").index, currentCard.dailyDraw);
      await page.waitForFunction(() => window.fixture.pending().length === 3);
      await respond(0, {hasTodayDraw: false}); await delay(50);
      assert.equal((await snapshot()).today.dailyDraw.drawId, 91);
      await respond(2, currentCard);
      await page.waitForFunction(() => !JSON.parse(document.querySelector("#snapshot").textContent).drawing);
      assert.equal((await snapshot()).today.dailyDraw.drawId, 91);
      passed.push({width, scenario: "draw-before-stale-get-and-double-click"});
      // 다른 저금통으로 이동한 후의 이전 POST는 추가 조회나 Zoom 갱신도 하지 않는다.
      await startDrawFixture();
      await page.evaluate(() => { void window.fixture.draw(); });
      await page.waitForFunction(() => window.fixture.pending().some(r => r.method === "post"));
      const oldPost = (await pending()).find(r => r.method === "post");
      await page.evaluate(() => window.fixture.changeJar(2));
      await page.waitForFunction(() => window.fixture.pending().some(r => r.url.includes("/jars/2/")));
      const latest = (await pending()).find(r => r.url.includes("/jars/2/"));
      await respond(latest.index, {...currentCard, dailyDraw: {...currentCard.dailyDraw, drawId: 92}});
      await respond(oldPost.index, currentCard.dailyDraw); await respond(0, currentCard); await delay(80);
      assert.equal((await snapshot()).today.dailyDraw.drawId, 92);
      assert.equal(await page.evaluate(() => window.fixture.zoomCalls), 0);
      assert.equal((await pending()).filter(r => r.url.includes("/jars/1/")).length, 2);
      passed.push({width, scenario: "draw-navigation"});

      const startCreation = async () => {
        await page.goto(base + "/tests/round4-races.html?body=CAT&step=image");
        await page.getByRole("tab", {name: "이미지 불러오기"}).click();
        const image = await page.evaluate(() => { const c = document.createElement("canvas"); c.width = c.height = 64;
          c.getContext("2d").fillRect(0, 0, 64, 64); return c.toDataURL().split(",")[1]; });
        await page.getByLabel("외부 이미지 선택", {exact: true}).setInputFiles({name: "fixture.png", mimeType: "image/png", buffer: Buffer.from(image, "base64")});
        const next = page.getByRole("button", {name: "이 그림으로 다음 단계 →", exact: true});
        await next.waitFor(); await next.click();
        await page.waitForFunction(() => window.fixture.pending().some(r => r.method === "post"));
      };
      for (const staleStatus of [200, 500]) {
        await startCreation();
        const upload = (await pending()).find(r => r.method === "post");
        await page.getByRole("link", {name: "← 만들기 방식 다시 선택"}).click();
        await page.getByText("제작 화면을 떠났어요").waitFor();
        await respond(upload.index, {draftId: 10}, staleStatus); await delay(100);
        assert.equal(new URL(page.url()).pathname, "/jars/new");
        assert.equal((await pending()).filter(r => r.method === "patch").length, 0);
        passed.push({width, scenario: "upload-navigation-" + staleStatus});
      }
      // 업로드 후 원본 선택이 진행 중일 때 같은 화면의 단계만 바꿔도 이전 URL로 돌아가지 않는다.
      await startCreation();
      await respond((await pending()).find(r => r.method === "post").index, {draftId: 10});
      await page.waitForFunction(() => window.fixture.pending().some(r => r.method === "patch")).catch(async e => {
        console.error(JSON.stringify({width, url: page.url(), pending: await pending(), text: (await page.locator("body").innerText()).slice(-900)}));
        throw e;
      });
      const selection = (await pending()).find(r => r.method === "patch");
      await page.evaluate(() => window.fixture.navigate("?body=CAT"));
      await respond(selection.index, {}); await delay(100);
      assert.equal(new URL(page.url()).searchParams.has("draft"), false);
      passed.push({width, scenario: "selection-step-navigation"});
      // 같은 보호 코드가 정상적인 업로드·원본 선택·후보 화면 이동은 막지 않아야 한다.
      await startCreation();
      // 화면 안의 앵커 이동은 제작 단계 변경이 아니므로 진행 중인 업로드를 취소하지 않는다.
      await page.evaluate(() => { window.location.hash = "preview"; });
      await respond((await pending()).find(r => r.method === "post").index, {draftId: 10});
      await page.waitForFunction(() => window.fixture.pending().some(r => r.method === "patch"));
      await respond((await pending()).find(r => r.method === "patch").index, {});
      await page.waitForURL(url => url.searchParams.get("draft") === "10");
      await page.waitForFunction(() => window.fixture.pending().some(r => r.method === "get" && r.url === "/api/v1/design-drafts/10"));
      await delay(50);
      passed.push({width, scenario: "creation-happy-path"});
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      assert.deepEqual(errors, []); await context.close();
    }
    console.log(JSON.stringify({passed}, null, 2));
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
