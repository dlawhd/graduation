/** 실제 React/WebGL에서 사진·테두리 완료 순서와 2D 복귀를 검사한다. 외부 요청은 전부 차단한다. */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const base = process.env.TEST_BASE_URL || "http://127.0.0.1:3001";
const output = path.resolve(__dirname, "../../build/safety-fixes-browser");
const gate = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

(async () => {
  await fs.mkdir(output, { recursive: true });
  const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const results = [];
  try {
    for (const mode of ["border-first", "photo-first", "latest-placement", "control-placement", "photo-error", "leave-while-loading"]) {
      const context = await browser.newContext({ viewport: { width: 800, height: 700 }, deviceScaleFactor: 1 });
      const page = await context.newPage();
      const errors = [], requests = [], failures = [];
      const photo = gate(), border = gate();
      page.on("pageerror", e => errors.push(e.message));
      page.on("requestfailed", r => { if (r.url().includes("part=IMAGE")) failures.push(r.failure()?.errorText); });
      // 빈 페이지에서 개인 정보가 없는 시험용 PNG를 만든다.
      const images = await page.evaluate(() => {
        const c = document.createElement("canvas"); c.width = c.height = 480; const ctx = c.getContext("2d");
        ctx.fillStyle = "#f7cf83"; ctx.fillRect(0, 0, 240, 480); ctx.fillStyle = "#317e65"; ctx.fillRect(240, 0, 240, 480);
        const photo = c.toDataURL("image/png").split(",")[1];
        ctx.clearRect(0, 0, 480, 480); ctx.strokeStyle = "#8abbb0"; ctx.lineWidth = 25;
        ctx.beginPath(); ctx.arc(240, 240, 190, 0, Math.PI * 2); ctx.stroke();
        return { photo, border: c.toDataURL("image/png").split(",")[1] };
      });
      await context.route("**/*", async route => {
        const url = new URL(route.request().url());
        if (!url.pathname.startsWith("/api/")) return url.origin === base ? route.continue() : route.abort();
        const part = url.searchParams.get("part");
        if (part !== "BODY" && part !== "IMAGE") return route.abort();
        requests.push(part);
        await (part === "BODY" ? border.promise : photo.promise);
        try {
          if (part === "IMAGE" && mode === "photo-error") return await route.fulfill({ status: 403, body: "fixture denied" });
          await route.fulfill({ status: 200, contentType: "image/png", body: Buffer.from(images[part === "BODY" ? "border" : "photo"], "base64") });
        } catch { /* 2D 복귀 시 취소된 요청은 정상적인 정리다. */ }
      });
      await page.goto(base + "/tests/photo-texture-race.html");
      await page.getByRole("button", { name: "3D로 보기", exact: true }).click();
      await page.waitForFunction(() => document.querySelector("[data-custom-body-viewer] canvas"));
      await assertEventually(() => requests.includes("BODY") && requests.includes("IMAGE"));
      if (mode === "leave-while-loading") {
        await page.getByRole("button", { name: "2D로 보기", exact: true }).click();
        border.resolve(); photo.resolve();
        await page.waitForFunction(() => document.querySelector("[data-custom-body-viewer]").dataset.viewMode === "2D");
        assert.equal(await page.locator("[data-custom-body-viewer] canvas").count(), 0);
      } else {
        if (mode === "border-first") border.resolve(); else photo.resolve();
        // 실제 PNG 해석과 onload까지 끝나게 해 두 순서를 분명하게 만든다. 속도 측정용 대기는 아니다.
        await page.waitForTimeout(200);
        if (mode === "latest-placement") await page.getByRole("button", { name: "사진 배치 변경" }).click();
        border.resolve(); photo.resolve();
        if (mode === "photo-error") {
          await page.getByRole("button", { name: "3D로 보기", exact: true }).waitFor();
          assert.equal(await page.locator("[data-custom-body-viewer] canvas").count(), 0);
        } else {
          await page.waitForFunction(() => { const button = document.querySelector('button[aria-label="3D 왼쪽으로 돌리기"]'); return button && !button.disabled; });
          if (mode === "control-placement") await page.getByRole("button", { name: "사진 배치 변경" }).click();
          await page.getByRole("button", { name: "정면으로", exact: true }).click();
          await page.waitForFunction(() => document.querySelector("[data-yaw]")?.dataset.yaw === "0");
          await page.locator("[data-custom-body-viewer] canvas").screenshot({ path: path.join(output, mode + ".png") });
          assert.equal(failures.length, 0, mode + ": 사진 요청이 취소되면 안 됨");
          await page.getByRole("button", { name: "3D 오른쪽으로 돌리기" }).click();
          await page.getByRole("button", { name: "정면으로", exact: true }).click();
          await page.getByRole("button", { name: "2D로 보기", exact: true }).click();
        }
      }
      assert.equal(requests.filter(p => p === "IMAGE").length, 1, mode + ": 사진 요청은 한 번이어야 함");
      const repeat = !["photo-error", "leave-while-loading"].includes(mode);
      if (repeat) {
        await page.getByRole("button", { name: "3D로 보기", exact: true }).click();
        await page.waitForFunction(() => { const button = document.querySelector('button[aria-label="3D 왼쪽으로 돌리기"]'); return button && !button.disabled; });
        assert.equal(requests.filter(p => p === "IMAGE").length, 2, mode + ": 반복 전환도 사진 요청 한 번만 허용");
        assert.equal(failures.length, 0);
        await page.getByRole("button", { name: "2D로 보기", exact: true }).click();
      }
      assert.deepEqual(errors, [], mode + ": 브라우저 예외");
      results.push({ mode, transitions: repeat ? 2 : 1, photoRequests: repeat ? 2 : 1, passed: true });
      await context.close();
    }
    assert.equal((await fs.readFile(path.join(output, "border-first.png"))).equals(await fs.readFile(path.join(output, "photo-first.png"))), true, "완료 순서가 달라도 완성 화면은 같아야 함");
    assert.equal((await fs.readFile(path.join(output, "latest-placement.png"))).equals(await fs.readFile(path.join(output, "control-placement.png"))), true, "늦은 테두리가 최신 사진 배치를 되돌리면 안 됨");
    console.log(JSON.stringify({ results, matchingFinalImages: true }, null, 2));
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });

async function assertEventually(condition) {
  const end = Date.now() + 10000;
  while (!condition()) { if (Date.now() > end) throw new Error("텍스처 요청 시작 시간 초과"); await new Promise(r => setTimeout(r, 20)); }
}
