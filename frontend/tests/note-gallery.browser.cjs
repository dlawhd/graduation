/** 실제 본인/공개 쪽지 화면을 사용한다. 합성 첨부와 로컬 API 대역만 사용하며 외부 요청은 차단한다. */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const { mkdirSync } = require('node:fs');
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:3004';
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true }), passed = [];
  try {
    for (const width of [390, 1280]) for (const kind of ['own', 'open']) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
      const page = await context.newPage(), errors = [];
      page.on('pageerror', e => errors.push(e.message));
      page.on('console', message => {
        // 실패 이미지의 의도된 404와 별도로 React 경고·실행 오류도 검사한다.
        if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) errors.push(message.text());
      });
      await context.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.origin !== base) return route.abort();
        if (url.pathname === '/tests/gallery-missing.svg') return route.fulfill({ status: 404, body: '' });
        if (/\/tests\/gallery-.*\.svg$/.test(url.pathname)) {
          const portrait = url.pathname.includes('-2.'), w = portrait ? 600 : 1200, h = portrait ? 1000 : 800;
          return route.fulfill({ contentType: 'image/svg+xml', body: `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="${portrait ? '#eed5df' : '#d7e9df'}"/><text x="10" y="80" font-size="40">${url.pathname}</text></svg>` });
        }
        if (url.pathname.endsWith('/video.mp4')) return route.fulfill({ status: 204, body: '' });
        return route.continue();
      });
      const viewer = page.getByRole('dialog', { name: '원본 사진 보기', exact: true });
      const next = viewer.getByRole('button', { name: '다음 사진', exact: true }), prev = viewer.getByRole('button', { name: '이전 사진', exact: true });
      const counter = viewer.getByRole('status', { name: '사진 순서', exact: true });
      const original = viewer.getByRole('img', { name: '원본 사진', exact: true });
      const close = viewer.getByRole('button', { name: '원본 사진 닫기', exact: true });
      async function touch(type, x, y) {
        await viewer.evaluate((node, point) => {
          const contact = new Touch({ identifier: 1, target: node, clientX: point.x, clientY: point.y });
          node.dispatchEvent(new TouchEvent(point.type, { bubbles: true, touches: point.type === 'touchstart' ? [contact] : [], changedTouches: [contact] }));
        }, { type, x, y });
      }
      async function ready(mode = 'multi') {
        await page.goto(`${base}/tests/note-gallery-preview.html?kind=${kind}&mode=${mode}`);
        await page.getByRole('button', { name: '쪽지 열기', exact: true }).click();
        if (kind === 'own') await page.getByRole('button', { name: /시험 쪽지/ }).click();
      }
      async function at(index, total, caption, fail = false) {
        await counter.filter({ hasText: `${index} / ${total}` }).waitFor();
        if (fail) await viewer.getByRole('alert').waitFor();
        else { await original.waitFor(); await page.waitForFunction(() => { const img = document.querySelector('[aria-label="원본 사진 보기"] img'); return img?.complete && img.naturalWidth > 0; }); }
        await viewer.getByText(caption, { exact: true }).waitFor();
      }
      await ready();
      const first = page.getByRole('button', { name: '1번째 사진 크게 보기', exact: true });
      const reads = await page.evaluate(() => window.galleryFixture.reads);
      await first.click(); await at(1, 4, '사진 설명 1');
      assert.equal(await prev.isDisabled(), true); assert.equal(await next.isEnabled(), true);
      assert.equal(await close.evaluate(n => n === document.activeElement), true);
      if (kind === 'open' && width === 390) {
        await touch('touchstart', 300, 350); await touch('touchend', 100, 355);
        await at(2, 4, '사진 설명 2');
        await touch('touchstart', 150, 300); await touch('touchend', 155, 500);
        await at(2, 4, '사진 설명 2');
        await page.keyboard.press('ArrowLeft'); await at(1, 4, '사진 설명 1');
      }
      await next.click(); await at(2, 4, '사진 설명 2');
      assert.equal(await original.evaluate(n => n.naturalWidth), 600);
      assert.equal(await original.evaluate(n => getComputedStyle(n).objectFit), 'contain');
      if (kind === 'open') {
        await original.hover(); await page.mouse.wheel(0, -150);
        await page.waitForFunction(() => document.querySelector('[aria-label="원본 사진 보기"] img').style.transform.includes('1.1'));
        const box = await original.boundingBox();
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 + 30, box.y + box.height / 2 + 20); await page.mouse.up();
        assert.equal(await original.evaluate(n => n.style.transform.startsWith('translate(0px, 0px)')), false);
        await touch('touchstart', 300, 350); await touch('touchend', 100, 355);
        await at(2, 4, '사진 설명 2');
      }
      await page.keyboard.press('ArrowRight'); await at(3, 4, '사진 설명 3', true);
      await next.click(); await at(4, 4, '사진 설명 4');
      assert.equal(await next.isDisabled(), true);
      if (kind === 'open') assert.equal(await original.evaluate(n => n.style.transform), 'translate(0px, 0px) scale(1)');
      await page.keyboard.press('ArrowRight'); await at(4, 4, '사진 설명 4');
      await prev.evaluate(n => { for (let i = 0; i < 20; i++) n.click(); });
      await at(1, 4, '사진 설명 1'); assert.equal(await prev.isDisabled(), true);
      await page.keyboard.press('ArrowLeft'); await at(1, 4, '사진 설명 1');
      assert.equal(await page.evaluate(() => window.galleryFixture.reads), reads, '사진 이동으로 쪽지 API를 추가 조회하지 않는다');
      for (let i = 0; i < 8; i++) { await page.keyboard.press('Tab'); assert.equal(await viewer.evaluate(n => n.contains(document.activeElement)), true); }
      assert.equal(await viewer.evaluate(n => n.scrollWidth <= n.clientWidth), true);
      mkdirSync('build/note-gallery', { recursive: true });
      await page.screenshot({ path: `build/note-gallery/${kind}-${width}.png` });
      await page.keyboard.press('Escape'); await viewer.waitFor({ state: 'detached' });
      assert.equal(await first.evaluate(n => n === document.activeElement), true);
      await page.getByRole('button', { name: '3번째 사진 크게 보기', exact: true }).click();
      await at(2, 4, '사진 설명 2'); await close.click(); await viewer.waitFor({ state: 'detached' });
      passed.push({ width, kind, test: '복수 사진·영상 제외·원본·설명·번호·경계·연속 입력·실패 후 이동·초점·키보드·확대 초기화·추가 API 없음' });

      await ready('single'); await page.getByRole('button', { name: '1번째 사진 크게 보기', exact: true }).click();
      await at(1, 1, '사진 설명 1'); assert.equal(await prev.isDisabled(), true); assert.equal(await next.isDisabled(), true);
      await page.keyboard.press('ArrowRight'); await at(1, 1, '사진 설명 1');
      await close.click(); await viewer.waitFor({ state: 'detached' });
      await ready('duplicate'); await page.getByRole('button', { name: '1번째 사진 크게 보기', exact: true }).click();
      await at(1, 2, '사진 설명 1'); await next.click(); await at(2, 2, '사진 설명 2');
      if (kind === 'open') {
        await page.evaluate(() => window.galleryFixture.replaceNote());
        await viewer.waitFor({ state: 'detached' });
      } else { await close.click(); await viewer.waitFor({ state: 'detached' }); }
      await ready('none'); assert.equal(await page.getByRole('button', { name: /사진 크게 보기/ }).count(), 0);
      assert.equal(await page.getByRole('dialog', { name: '원본 사진 보기', exact: true }).count(), 0);
      assert.deepEqual(errors, []);
      passed.push({ width, kind, test: '한 장·동일 주소 여러 장·사진 없음·쪽지 변경 시 닫기' });
      await context.close();
    }
    console.log(JSON.stringify({ result: 'PASS', passed }));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
