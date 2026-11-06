/** 실제 모달·SVG 디자인을 PC/터치 화면에서 검사한다. 외부 요청·실제 음원 재생·운영 DB는 사용하지 않는다. */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict'), fs = require('node:fs');
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:3004';
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true }), passed = [];
  try {
    for (const width of [390, 1280]) {
      const context = await browser.newContext({ viewport: { width, height: 950 }, isMobile: width === 390, hasTouch: width === 390 });
      await context.addInitScript(() => {
        window.audioAudit = { contexts: 0, voices: 0, closed: 0, stops: 0 };
        window.AudioContext = class {
          constructor() { window.audioAudit.contexts++; this.currentTime = 0; this.state = 'running'; this.destination = {}; }
          close() { window.audioAudit.closed++; return Promise.resolve(); }
          createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, disconnect() {} }; }
          createOscillator() { window.audioAudit.voices++; return { frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, disconnect() {}, start() {}, stop() { window.audioAudit.stops++; } }; }
        };
      });
      const requests = [], errors = [], pendingImages = [];
      await context.route('**/*', route => {
        const url = new URL(route.request().url()); requests.push(url.pathname);
        if (url.pathname === '/api/v1/jars/7/design/texture') return route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64') });
        if (url.origin !== base) return route.abort();
        if (url.pathname === '/tests/opening-opaque.svg') return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="480"><rect width="480" height="480" fill="white"/><circle cx="240" cy="135" r="89" fill="#f2ce08"/><ellipse cx="208" cy="126" rx="21" ry="27" fill="white"/><ellipse cx="272" cy="126" rx="21" ry="27" fill="white"/><circle cx="211" cy="127" r="10"/><circle cx="269" cy="127" r="10"/><path d="M192 163Q240 205 290 164M240 224V332M240 252L161 281L147 345M240 252L319 281L333 345M240 332L202 397L164 430M240 332L278 397L316 430" fill="none" stroke="#d9b807" stroke-width="17" stroke-linecap="round"/></svg>' });
        if (url.pathname === '/tests/opening-hang.svg') { pendingImages.push(route); return; }
        if (url.pathname.includes('opening-missing') || url.pathname.includes('opening-body-missing')) return route.fulfill({ status: 404, body: '' });
        if (url.pathname === '/tests/opening-photo.svg') return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="480"><rect width="480" height="480" fill="#dbe8d2"/><path d="M0 380L160 240L480 360V480H0Z" fill="#94b79a"/><path d="M200 480Q390 400 235 310" fill="none" stroke="#f6eac6" stroke-width="50"/><circle cx="335" cy="110" r="50" fill="#f1d499"/><text x="90" y="215" fill="#46624c" font-size="30">Our Memory</text></svg>' });
        return route.continue();
      });
      const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
      page.on('console', message => { if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) errors.push(message.text()); });
      const modal = page.getByRole('dialog', { name: '톡톡, 추억이 열리는 순간', exact: true });
      const primary = modal.locator('.jar-opening-primary');
      async function ready(mode = 'prepared') {
        await page.goto(`${base}/tests/jar-opening-preview.html?mode=${mode}`);
        await page.getByRole('button', { name: '오픈 연출 열기', exact: true }).click();
      }
      async function phase(value) { await page.waitForFunction(expected => document.querySelector('.jar-opening-dialog')?.dataset.phase === expected, value); }
      await ready(); await modal.waitFor(); await primary.waitFor({ state: 'visible' });
      await page.waitForFunction(() => !document.querySelector('.jar-opening-primary').disabled);
      assert.equal(await modal.evaluate(n => n.matches(':modal')), true);
      assert.equal(await page.evaluate(() => window.audioAudit.contexts), 0);
      assert.equal(await page.locator('canvas').count(), 0);
      assert.equal(await modal.locator('.jar-opening-piece').count(), 12);
      assert.equal(await modal.locator('[data-jar-body="CLOUD"]').count(), 12);
      assert.equal(await modal.locator('.jar-opening-footer').count(), 0);
      assert.equal(await modal.getByRole('button', { name: /움직임 줄이기/ }).count(), 0);
      assert.ok((await modal.locator('.jar-opening-saved-art img').first().getAttribute('src')).endsWith('/tests/opening-photo.svg'));
      assert.equal(await page.getByRole('button', { name: '배경 버튼', exact: true }).evaluate(n => { n.focus(); return n === document.activeElement; }), false);
      // 같은 프레임의 중복 클릭도 한 번만 진행하고 소리도 한 번만 만든다.
      await primary.evaluate(n => { for (let i = 0; i < 10; i++) n.click(); });
      await phase('tapping'); assert.equal(await primary.isDisabled(), true);
      assert.equal(await modal.locator('.jar-opening-scene').getAttribute('data-hits'), '0', '망치가 닿기 전에는 금이 생기면 안 된다');
      assert.equal(await page.evaluate(() => window.audioAudit.voices), 0, '접촉 전에는 타격음도 내지 않는다');
      await page.waitForFunction(() => document.querySelector('.jar-opening-scene')?.dataset.hits === '1');
      fs.mkdirSync('build/jar-opening', { recursive: true });
      await modal.screenshot({ path: `build/jar-opening/impact-${width}.png` });
      await phase('ready');
      assert.equal(await modal.locator('.jar-opening-crack-line').count(), 3);
      assert.equal(await modal.locator('.jar-opening-progress').getAttribute('aria-label'), '1 / 3번 두드림');
      assert.equal(await page.evaluate(() => window.audioAudit.voices), 1);
      await modal.getByRole('button', { name: '소리 끄기', exact: true }).click();
      await primary.click(); await phase('ready');
      assert.equal(await page.evaluate(() => window.audioAudit.voices), 1);
      assert.ok(await modal.locator('.jar-opening-crack-line').count() > 3);
      fs.mkdirSync('build/jar-opening', { recursive: true });
      await modal.screenshot({ path: `build/jar-opening/second-tap-${width}.png` });
      await primary.click(); await phase('complete'); await page.waitForTimeout(350);
      await modal.screenshot({ path: `build/jar-opening/shattering-${width}.png` });
      await page.waitForTimeout(1400);
      assert.equal(await modal.locator('.jar-opening-progress').getAttribute('aria-label'), '3 / 3번 두드림');
      assert.equal(await modal.locator('.jar-opening-envelope').count(), 3);
      assert.equal(await modal.locator('.jar-opening-mallet').count(), 0);
      assert.equal(await modal.locator('.jar-opening-piece').first().evaluate(n => getComputedStyle(n).opacity), '0');
      assert.equal(await page.locator('canvas').count(), 0);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
      assert.equal(await modal.evaluate(n => n.scrollWidth <= n.clientWidth + 1), true);
      await modal.screenshot({ path: `build/jar-opening/complete-${width}.png` });
      await primary.evaluate(n => { n.click(); n.click(); }); await modal.waitFor({ state: 'detached' });
      assert.equal(await page.evaluate(() => window.openingFixture.viewed), 1);
      assert.equal(await page.evaluate(() => window.audioAudit.closed), 1);
      assert.equal(await page.evaluate(() => document.body.style.overflow), '');
      assert.equal(await page.getByRole('button', { name: '오픈 연출 열기' }).evaluate(n => n === document.activeElement), true);
      passed.push({ width, test: '3회 진행·중복 클릭·소리·실제 디자인·조각·완료 이동·자원 정리' });

      await page.emulateMedia({ reducedMotion: 'reduce' });
      for (const mode of ['custom', 'image', 'theme', 'panda', 'protected']) {
        await ready(mode); await page.waitForFunction(() => !document.querySelector('.jar-opening-primary').disabled);
        if (mode === 'custom') assert.equal(await modal.locator('[data-jar-body="CUSTOM"]').count(), 12);
        assert.equal(await modal.getAttribute('data-reduced'), 'true');
        await primary.click(); await phase('ready');
        assert.equal(await modal.locator('.jar-opening-progress').getAttribute('aria-label'), '1 / 3번 두드림');
        await modal.getByRole('button', { name: /건너뛰기/ }).click(); await phase('complete');
        assert.equal(await modal.locator('.jar-opening-envelope').first().evaluate(n => getComputedStyle(n).animationName), 'none');
        if (mode === 'panda') {
          assert.equal(await modal.locator('[data-jar-body="RED_PANDA"]').count(), 12);
          await modal.screenshot({ path: `build/jar-opening/panda-complete-${width}.png` });
        }
        await modal.getByRole('button', { name: '조금 있다 보기', exact: true }).click();
        await modal.waitFor({ state: 'detached' });
      }
      passed.push({ width, test: '직접 만든 틀·이미지 단독·기본 테마·건너뛰기·움직임 줄이기' });
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      // 사용자 제보와 같은 흰 배경의 가는 캐릭터도 실제 몸체에 금이 가고 사각 배경 없이 깨져야 한다.
      await ready('opaque'); await page.waitForFunction(() => !document.querySelector('.jar-opening-primary').disabled);
      assert.ok((await modal.locator('.jar-opening-piece-clip').first().evaluate(n => getComputedStyle(n).maskImage)).includes('blob:'));
      await primary.click(); await phase('ready');
      await modal.screenshot({ path: `build/jar-opening/opaque-cracked-${width}.png` });
      await primary.click(); await phase('ready');
      await modal.screenshot({ path: `build/jar-opening/opaque-second-${width}.png` });
      await primary.click(); await phase('complete'); await page.waitForTimeout(350);
      await modal.screenshot({ path: `build/jar-opening/opaque-shattering-${width}.png` });
      await page.waitForTimeout(1400);
      assert.equal(await modal.locator('.jar-opening-piece').last().evaluate(n => getComputedStyle(n).opacity), '0');
      await modal.getByRole('button', { name: '조금 있다 보기', exact: true }).click();

      for (const mode of ['missing', 'body-error']) {
        await ready(mode); await modal.getByRole('alert').waitFor();
        assert.equal(await primary.isDisabled(), true);
        await modal.getByRole('button', { name: '이미지 다시 불러오기', exact: true }).click();
        await page.waitForFunction(() => !document.querySelector('.jar-opening-primary').disabled);
        assert.equal(await page.evaluate(() => window.openingFixture.reloads), 1);
        await page.keyboard.press('Escape'); await modal.waitFor({ state: 'detached' });
      }
      await ready(); await page.waitForFunction(() => !document.querySelector('.jar-opening-primary').disabled);
      await primary.click(); await phase('tapping');
      await modal.getByRole('button', { name: /건너뛰기/ }).click(); await phase('complete'); await page.waitForTimeout(700); await phase('complete');
      for (let i = 0; i < 10; i++) { await page.keyboard.press('Tab'); assert.equal(await modal.evaluate(n => n.contains(document.activeElement)), true); }
      await page.evaluate(() => window.openingFixture.replace());
      await page.waitForFunction(() => document.querySelector('.jar-opening-progress')?.getAttribute('aria-label') === '0 / 3번 두드림');
      await page.keyboard.press('Escape'); await modal.waitFor({ state: 'detached' });
      await ready('theme'); await primary.click(); await phase('tapping');
      await page.keyboard.press('Escape'); await modal.waitFor({ state: 'detached' }); await page.waitForTimeout(700);
      assert.equal(await page.evaluate(() => window.audioAudit.closed), 1, '두드리는 도중 닫아도 오디오를 정리한다');
      await page.getByRole('button', { name: '오픈 연출 열기', exact: true }).click();
      assert.equal(await modal.locator('.jar-opening-progress').getAttribute('aria-label'), '0 / 3번 두드림');
      await page.keyboard.press('Escape'); await modal.waitFor({ state: 'detached' });
      await ready('missing'); await modal.getByRole('alert').waitFor();
      await modal.getByRole('button', { name: /건너뛰기/ }).click(); await phase('complete');
      assert.equal(await primary.isEnabled(), true, '그림 실패가 추억 보기를 막지 않는다');
      await primary.click(); await modal.waitFor({ state: 'detached' });
      assert.equal(await page.evaluate(() => window.openingFixture.viewed), 1);
      if (width === 1280) {
        await ready('hang'); await modal.getByRole('alert').waitFor({ timeout: 10000 });
        assert.equal(await primary.isDisabled(), true);
        await modal.getByRole('button', { name: /건너뛰기/ }).click(); await phase('complete');
        await primary.click(); await modal.waitFor({ state: 'detached' });
        for (const route of pendingImages) await route.abort().catch(() => {});
      }
      for (const mode of ['locked', 'mismatch']) { await ready(mode); assert.equal(await modal.count(), 0); }
      await page.emulateMedia({ reducedMotion: 'reduce' }); await ready('theme');
      assert.equal(await modal.getAttribute('data-reduced'), 'true');
      await modal.getByRole('button', { name: '조금 있다 보기', exact: true }).click();
      assert.deepEqual(errors, []);
      assert.equal(requests.filter(path => path.startsWith('/api/') && path !== '/api/v1/jars/7/design/texture').length, 0);
      passed.push({ width, test: '이미지·테두리 실패 복구·도중 건너뛰기·Tab·Esc·저금통 변경·공개 상태 검사·OS 움직임 설정' });
      await context.close();
    }
    console.log(JSON.stringify({ result: 'PASS', passed }));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
