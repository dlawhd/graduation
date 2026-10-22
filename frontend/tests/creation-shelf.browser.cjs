/** 실제 React 화면의 생성 선택·제작 단계·9개 스타일·카드 목록을 검증한다.
 * 모든 API·소켓은 대역으로 처리하고 외부 통신은 차단한다. 운영/유료 AI 시험이 아니다.
 */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:3000';
const output = path.resolve(__dirname, '../../build/creation-shelf');

(async () => {
  await fs.mkdir(output, { recursive: true });
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, reducedMotion: 'reduce' });
  const errors = [], generated = [], listRequests = [], unexpected = [], external = [];
  let listMode = 'normal';
  const items = Array.from({ length: 9 }, (_, i) => ({ jarId: i + 1, name: ['우리의 작은 순간', '친구들과의 봄날', '가족의 하루'][i % 3],
    description: i === 6 ? '아주 긴 설명과 이름도 카드의 크기를 깨뜨리지 않고 안정적으로 읽을 수 있어야 해요. '.repeat(8) : '함께 모은 소중한 기억을 차곡차곡 담아요.',
    theme: ['DEW', 'SPRING', 'SAND'][i % 3], memberCount: i + 1, maxMembers: 10, myRole: ['OWNER', 'ADMIN', 'MEMBER'][i % 3],
    openAt: '2026-12-25T12:00:00+09:00', isOpen: i === 2,
    design: i % 3 === 1 ? null : { designType: 'ORIGINAL', bodyStyle: i % 3 === 0 ? 'CAT' : 'STAR',
      imageUrl: `${base}/images/ai-styles/${i % 3 === 0 ? 'watercolor' : 'cute-2d'}.webp`, slotCenterX: .5, slotCenterY: .28, slotSizeRatio: .2, slotStyle: 'CAPSULE' } }));
  let draft = { draftId: 10, status: 'ACTIVE', selectedDesignType: 'ORIGINAL', selectedGenerationId: null, bodyStyle: null,
    slotCenterX: .5, slotCenterY: .25, slotSizeRatio: .3, slotStyle: 'CAPSULE', generations: [], cutoutRegions: [] };
  await context.routeWebSocket(/.*/, ws => ws.onMessage(frame => {
    if (frame.startsWith('CONNECT')) ws.send('CONNECTED\nversion:1.2\nheart-beat:0,0\n\n\0');
  }));
  await context.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url()), p = url.pathname;
    const json = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ data }) });
    if (p.startsWith('/api/')) {
      if (p === '/api/v1/me') return json({ userId: 999, name: '로컬 화면 시험' });
      if (p.endsWith('/onboarding')) return json({ version: 1, items: ['WELCOME', 'JAR_LIST', 'JAR_CREATE', 'JAR_DETAIL', 'JAR_INVITE', 'DAILY_DRAW'].map(tutorialKey => ({ tutorialKey, handled: true, status: 'COMPLETED' })) });
      if (p.endsWith('/csrf')) return json({ token: 'test-only', headerName: 'X-XSRF-TOKEN' });
      if (p.endsWith('/unread-count')) return json({ unreadCount: 0 });
      if (p.endsWith('/support/permissions')) return json({ operator: false });
      if (p === '/api/v1/jars' && req.method() === 'GET') {
        listRequests.push(url.search);
        if (listMode === 'error') return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { message: '목록 시험 오류' } }) });
        if (listMode === 'empty') return json({ items: [], totalElements: 0, totalPages: 0, page: 0 });
        const page = Number(url.searchParams.get('page') || 0);
        return json({ items: page === 0 ? items : items.slice(0, 2), totalElements: 11, totalPages: 2, page });
      }
      if (p === '/api/v1/design-drafts/10') return json(draft);
      if (p.endsWith('/preview')) return json({ previewUrl: `${base}/images/ai-styles/cute-2d.webp` });
      if (p.endsWith('/generations') && req.method() === 'POST') {
        const body = req.postDataJSON(); generated.push(body.style);
        const generationId = 100 + generated.length;
        draft = { ...draft, generations: [...draft.generations, { generationId, style: body.style, status: 'SUCCEEDED' }] };
        return json({ generationId }, 202);
      }
      if (p.endsWith('/inquiries')) return json({ items: [] });
      unexpected.push(`${req.method()} ${p}`);
      return json({ items: [] });
    }
    if (url.origin === base) return route.continue();
    external.push(url.origin); return route.abort();
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  const noOverflow = async () => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, '가로 스크롤 없음');
  const capture = name => page.screenshot({ path: path.join(output, name + '.png'), fullPage: true });
  try {
    await page.goto(base + '/jars/new');
    await page.getByRole('heading', { name: '어떤 저금통을 만들어볼까요?' }).waitFor();
    assert.equal(await page.locator('.creation-option').count(), 2);
    assert.equal(await page.locator('.creation-option-ready').getAttribute('href'), '/jars/new?mode=default');
    await noOverflow(); await capture('choices-desktop');
    await page.locator('.creation-option-ready').click();
    await page.getByRole('heading', { name: '어떤 저금통을 만들고 싶어요?' }).waitFor();
    await page.goto(base + '/jars/new');
    await page.locator('.creation-option-custom').click();
    await page.locator('.design-progress [aria-current="step"]').filter({ hasText: '틀 만들기 또는 선택' }).waitFor();
    assert.equal(await page.locator('.design-progress li[data-status="current"]').count(), 1);
    await capture('progress-desktop');
    await page.goto(base + '/jars/design/new?mode=image-only&step=image');
    await page.locator('.design-progress [aria-current="step"]').filter({ hasText: '그림 담기' }).waitFor();
    assert.equal(await page.locator('.design-progress li[data-status="complete"]').count(), 1);
    await page.goto(base + '/jars/design/new?draft=10');
    await page.getByRole('button', { name: /네온 드로잉/ }).waitFor();
    assert.equal(await page.locator('button[aria-pressed]').filter({ has: page.locator('img[src*="ai-styles"]') }).count(), 9);
    for (const [id, label] of [['NEON_DRAWING', '네온 드로잉'], ['CHROME_MIRROR', '크롬 미러'], ['RISO_PRINT', '리소 프린트']]) {
      const choice = page.getByRole('button', { name: new RegExp(label) });
      await choice.click(); assert.equal(await choice.getAttribute('aria-pressed'), 'true');
      await page.getByRole('button', { name: '선택한 스타일로 한 장 만들기 ✦', exact: true }).click();
      await page.waitForFunction(count => document.querySelectorAll('select option').length >= count, 1);
      await page.getByRole('button', { name: '선택한 스타일로 한 장 만들기 ✦', exact: true }).waitFor();
      assert.equal(generated.at(-1), id);
    }
    assert.deepEqual(generated, ['NEON_DRAWING', 'CHROME_MIRROR', 'RISO_PRINT']);
    await page.locator('[data-design-step="5"] input').first().focus();
    await page.locator('.design-progress [aria-current="step"]').filter({ hasText: '이름 붙이기' }).waitFor();
    await page.locator('[data-design-step="4"] input').first().focus();
    await page.locator('.design-progress [aria-current="step"]').filter({ hasText: '투입구와 배경' }).waitFor();
    await page.getByRole('button', { name: /네온 드로잉/ }).focus();
    await page.locator('.design-progress [aria-current="step"]').filter({ hasText: '사진 배치와 AI 꾸미기' }).waitFor();
    await page.getByRole('button', { name: /크롬 미러/ }).scrollIntoViewIfNeeded();
    await capture('styles-desktop');
    await page.getByRole('group', { name: 'AI 스타일 선택', exact: true }).screenshot({ path: path.join(output, 'style-picker-desktop.png') });
    await page.goto(base + '/jars');
    await page.locator('.jar-shelf-card').first().waitFor();
    assert.equal(await page.locator('.jar-shelf-card').count(), 9);
    const cards = await page.locator('.jar-shelf-card').evaluateAll(nodes => nodes.slice(0, 3).map(node => node.getBoundingClientRect().top));
    assert.ok(cards.every(y => Math.abs(y - cards[0]) < 2), 'PC 3열 카드');
    // 공통 헤더의 기존 목록 조회는 별도이며, 보관함 페이지가 9개 단위로 요청하는지 확인한다.
    assert.ok(listRequests.some(search => new URLSearchParams(search).get('size') === '9'));
    assert.equal(await page.locator('.jar-shelf-card a,.jar-shelf-card button').count(), 0, '중첩 링크/버튼 없음');
    await noOverflow(); await capture('shelf-desktop');
    await page.getByRole('button', { name: '다음', exact: true }).click();
    await page.getByText('2 / 2', { exact: true }).waitFor();
    assert.equal(await page.locator('.jar-shelf-card').count(), 2);
    for (const width of [768, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(base + '/jars'); await page.locator('.jar-shelf-card').first().waitFor();
      await noOverflow(); await capture('shelf-' + width);
      if (width < 560) {
        const positions = await page.locator('.jar-shelf-card').evaluateAll(nodes => nodes.slice(0, 2).map(n => n.getBoundingClientRect().top));
        assert.ok(positions[1] > positions[0], '모바일 1열 카드');
      }
      await page.goto(base + '/jars/new'); await page.locator('.creation-option').first().waitFor();
      await noOverflow(); await capture('choices-' + width);
      await page.goto(base + '/jars/design/new?draft=10'); await page.getByRole('button', { name: /네온 드로잉/ }).waitFor();
      await noOverflow(); await capture('styles-' + width);
    }
    listMode = 'empty'; await page.goto(base + '/jars');
    await page.getByText('아직 참여 중인 저금통이 없어요.', { exact: true }).waitFor();
    listMode = 'error'; await page.reload();
    await page.getByText('목록 시험 오류', { exact: true }).waitFor();
    assert.deepEqual(errors, []);
    assert.deepEqual(unexpected, []);
    console.log(JSON.stringify({ status: 'PASSED', styles: generated, screenshots: output, listRequests: listRequests.length, externalBlocked: [...new Set(external)] }, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
