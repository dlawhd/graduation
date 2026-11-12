/** 실제 저금통 상세의 REST 오픈 감지·확인 기록·다시 보기·쪽지 이동을 검증한다. 외부 요청은 차단한다. */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:3004';
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true }), passed = [];
  try {
    for (const width of [390, 1280]) {
      const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
      await context.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
      await context.routeWebSocket('**/*', socket => {
        socket.onMessage(raw => { if (String(raw).startsWith('CONNECT')) socket.send('CONNECTED\nversion:1.2\nheart-beat:0,0\n\n\0'); });
      });
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(base + '/tests/user-state-preview.html');
      await page.getByRole('button', { name: '내가 넣은 쪽지', exact: true }).waitFor();
      const modal = page.getByRole('dialog', { name: '톡톡, 추억이 열리는 순간', exact: true });
      assert.equal(await modal.count(), 0);
      assert.equal(await page.getByRole('button', { name: '추억 열기 다시 보기', exact: true }).count(), 0);
      assert.equal(await page.evaluate(() => window.fixture.requests.some(row => row.url === '/api/v1/jars/7/notes')), false);
      // 로컬 시간 대신 서버 응답의 공개 상태가 바뀌었을 때 처음 표시된다.
      await page.evaluate(() => { window.fixture.jar.isOpen = true; window.dispatchEvent(new Event('focus')); });
      await modal.waitFor(); assert.equal(await modal.locator('.jar-opening-progress').getAttribute('aria-label'), '0 / 3번 두드림');
      await modal.getByRole('button', { name: /건너뛰기/ }).click();
      await modal.getByRole('button', { name: '추억 보러가기', exact: true }).click();
      await page.locator('.jar-zoom-pop').waitFor();
      await page.getByText('아직 들어간 쪽지가 없어요.', { exact: true }).waitFor();
      assert.equal(await page.evaluate(() => sessionStorage.getItem('memoryjar:jar-open-celebration:1:7')), 'seen');
      await page.locator('.jar-zoom-pop').getByRole('button', { name: '닫기', exact: true }).click();
      await page.evaluate(() => window.dispatchEvent(new Event('focus'))); await page.waitForTimeout(500);
      assert.equal(await modal.count(), 0, '서버 재조회로 축하 창이 중복 표시되지 않는다');
      // 공개 뒤에도 본인 목록을 별도로 조회하며 다른 멤버의 목록으로 바꾸지 않는다.
      await page.getByRole('button', { name: '내가 넣은 쪽지', exact: true }).click();
      const own = page.getByRole('dialog', { name: '내가 넣은 쪽지', exact: true });
      await own.waitFor();
      await own.getByText('내가 넣은 쪽지만 모아 볼 수 있어요.', { exact: false }).waitFor();
      await own.getByText('나의 추억 1', { exact: true }).waitFor();
      await own.getByRole('button', { name: '닫기', exact: true }).click();
      await page.getByRole('button', { name: '전체 쪽지', exact: true }).click();
      await page.locator('.jar-zoom-pop').waitFor();
      await page.getByText('아직 들어간 쪽지가 없어요.', { exact: true }).waitFor();
      await page.locator('.jar-zoom-pop').getByRole('button', { name: '닫기', exact: true }).click();
      await page.getByRole('button', { name: '추억 열기 다시 보기', exact: true }).click();
      await modal.waitFor(); assert.equal(await modal.locator('.jar-opening-progress').getAttribute('aria-label'), '0 / 3번 두드림');
      await page.keyboard.press('Escape'); await modal.waitFor({ state: 'detached' });
      assert.equal(await page.evaluate(() => document.body.style.overflow), '');
      // 열린 뒤 새 탭에서 처음 접속하면 버튼을 누르기 전까지 연출이 열리지 않는다.
      const openedPage = await context.newPage();
      await openedPage.goto(base + "/tests/user-state-preview.html?opened=1");
      await openedPage.getByRole("button", { name: "전체 쪽지", exact: true }).waitFor();
      const alreadyOpenModal = openedPage.getByRole("dialog", { name: "톡톡, 추억이 열리는 순간" });
      assert.equal(await alreadyOpenModal.count(), 0);
      await openedPage.getByRole("button", { name: "추억 열기 다시 보기", exact: true }).click();
      await alreadyOpenModal.waitFor();
      await openedPage.keyboard.press("Escape");
      await alreadyOpenModal.waitFor({ state: "detached" });

      // 마우스로 열린 채팅창은 즉시 닫히지 않고, 키보드로 닫으면 호출 버튼으로 돌아간다.
      const chatButton = openedPage.getByRole("button", { name: "저금통 채팅", exact: true });
      await chatButton.click();
      const chat = openedPage.getByRole("dialog", { name: "나의 시험 저금통 채팅" });
      await chat.waitFor();
      assert.equal(await chat.getByRole("button", { name: "닫기", exact: true }).evaluate(button => button === document.activeElement), true);
      await openedPage.keyboard.press("Tab");
      assert.equal(await chat.evaluate(dialog => dialog.contains(document.activeElement)), true);
      await openedPage.keyboard.press("Escape");
      await chat.waitFor({ state: "detached" });
      assert.equal(await chatButton.evaluate(button => button === document.activeElement), true);
      await openedPage.close();
      assert.deepEqual(errors, []);
      passed.push({ width, test: '잠금 전 비노출·REST 공개 감지·추억 목록 이동·확인 기록·중복 표시 방지·다시 보기·Esc' });
      await context.close();
    }
    console.log(JSON.stringify({ result: 'PASS', passed }));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
