/** 운영·유료 API를 차단하고 실제 React 화면에서 댓글 페이지, 깊은 답글, 300자 입력, 입자 정지를 검증한다. */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:3002';
(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const width = Number(process.env.TEST_VIEWPORT_WIDTH) || 1440;
  const context = await browser.newContext({ viewport: { width, height: width < 600 ? 844 : 1100 }, reducedMotion: 'reduce' });
  await context.addInitScript(() => { window.__MEMORYJAR_AUDIT_TEST__ = true; });
  const errors = [], reads = [], unexpected = [];
  const rows = Array.from({ length: 67 }, (_, index) => ({ commentId: index + 1, userId: 1, authorName: '시험 작성자',
    parentCommentId: index === 65 ? 65 : index === 66 ? 66 : null, content: `댓글-${index + 1}`,
    createdAt: '2026-10-04T10:00:00+09:00', updatedAt: '2026-10-04T10:00:00+09:00', replies: [] }));
  let failNext = false;
  await context.routeWebSocket(/.*/, ws => {
    ws.onMessage(frame => { if (frame.startsWith('CONNECT')) ws.send('CONNECTED\nversion:1.2\nheart-beat:0,0\n\n\0'); });
  });
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname;
    const ok = data => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data }) });
    if (path.startsWith('/api/')) {
      if (path.endsWith('/csrf')) return ok({ token: 'fixture', headerName: 'X-XSRF-TOKEN' });
      if (path === '/api/v1/me') return ok({ userId: 1, name: '시험 작성자' });
      if (path === '/api/v1/jars/10') return ok({ jarId: 10, name: '시험 저금통', theme: 'SPRING', isOpen: true,
        myRole: 'OWNER', maxMembers: 2, memberCount: 1, noteCount: 1, openAt: '2026-10-04T10:00:00+09:00', openMode: 'ALL_AT_ONCE', lockLevel: 'TITLE_ONLY' });
      if (path.endsWith('/members')) return ok({ items: [{ userId: 1, name: '시험 작성자', role: 'OWNER' }] });
      if (path.endsWith('/invites')) return ok({ items: [] });
      if (path.endsWith('/unread-count') || path.endsWith('/chat/unread')) return ok({ unreadCount: 0 });
      if (path.endsWith('/daily-draw/today')) return ok({ hasTodayDraw: false });
      if (path.endsWith('/daily-draw/history')) return ok({ items: [], totalPages: 0 });
      if (path.endsWith('/notes')) return ok({ items: [{ noteId: 1, title: '시험 쪽지', previewContent: '본문', authorId: 1, authorName: '시험 작성자', commentCount: rows.length }], page: 0, totalPages: 1, totalElements: 1 });
      if (path.endsWith('/notes/1')) return ok({ noteId: 1, jarId: 10, authorId: 1, authorName: '시험 작성자', title: '시험 쪽지', content: '본문', commentCount: rows.length, attachments: [], reactionCounts: [] });
      if (path.endsWith('/comments/page')) {
        const cursor = Number(url.searchParams.get('cursor')), focus = Number(url.searchParams.get('focusId'));
        reads.push({ cursor, focus });
        if (failNext) { failNext = false; return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { message: '일시적인 댓글 조회 오류' } }) }); }
        const batch = rows.filter(row => row.commentId > cursor).slice(0, 30);
        const next = batch.at(-1)?.commentId || cursor;
        const selected = new Map(batch.map(row => [row.commentId, row]));
        for (let row = rows.find(row => row.commentId === focus); row; row = rows.find(parent => parent.commentId === row.parentCommentId)) selected.set(row.commentId, row);
        return ok({ items: [...selected.values()].sort((a,b) => a.commentId-b.commentId), flat: true,
          nextCursor: next, hasMore: rows.some(row => row.commentId > next), totalCount: rows.length });
      }
      if (path.endsWith('/comments') && request.method() === 'POST') {
        const body = request.postDataJSON(), row = { ...rows[0], commentId: rows.length + 1, parentCommentId: body.parentCommentId || null, content: body.content };
        rows.push(row); return ok(row);
      }
      unexpected.push(request.method() + ' ' + path);
      return route.fulfill({ status: 404, body: '{}' });
    }
    if (url.origin !== new URL(base).origin && !url.protocol.startsWith('data')) return route.abort();
    return route.continue();
  });
  const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
  // 실제 오픈 축하 UX도 정상적으로 닫은 뒤 댓글 버튼을 조작한다.
  const closeCelebration = async () => {
    const later = page.getByRole('button', { name: '조금 있다 보기', exact: true });
    try { await later.waitFor({ state: 'visible', timeout: 2000 }); } catch { return; }
    await later.click();
  };
  try {
    await page.goto(`${base}/tests/write-safety.html`);
    await page.locator('#jar-comment-1').waitFor();
    await closeCelebration();
    assert.equal(await page.locator('[id^="jar-comment-"]').count(), 30);
    assert.equal(reads.length, 1);
    failNext = true;
    await page.getByRole('button', { name: '댓글 더 보기', exact: true }).click();
    await page.getByText('일시적인 댓글 조회 오류', { exact: true }).waitFor();
    assert.equal(await page.locator('[id^="jar-comment-"]').count(), 30);
    await page.getByRole('button', { name: '댓글 더 보기', exact: true }).click();
    await page.locator('#jar-comment-60').waitFor();
    await page.getByRole('button', { name: '댓글 더 보기', exact: true }).click();
    await page.locator('#jar-comment-65').waitFor();
    await page.locator('#jar-comment-65').getByRole('button', { name: '답글 2개 보기', exact: true }).click();
    await page.locator('#jar-comment-66').getByRole('button', { name: '답글 1개 보기', exact: true }).click();
    await page.locator('#jar-comment-67').waitFor();
    assert.equal(await page.locator('[id^="jar-comment-"]').count(), 67);
    await page.goto(`${base}/tests/write-safety.html?focus=67`);
    await page.locator('#jar-comment-67').waitFor();
    await closeCelebration();
    assert.equal(await page.locator('[id^="jar-comment-"]').count(), 33);
    assert.equal(reads.at(-1).cursor, 0);
    assert.equal(reads.at(-1).focus, 67);
    await page.goto(`${base}/tests/write-safety.html`);
    await page.locator('#jar-comment-1').waitFor();
    await closeCelebration();
    await page.locator('#jar-comment-1').getByRole('button', { name: '답글 달기', exact: true }).click();
    await page.getByPlaceholder('이 댓글에 답글을 남겨보세요.').fill('새 답글');
    await page.getByRole('button', { name: '답글 등록', exact: true }).click();
    await page.locator('#jar-comment-68').waitFor();
    assert.equal(await page.locator('#jar-comment-68').getByText('새 답글', { exact: true }).count(), 1);
    assert.equal(reads.at(-1).cursor, 0); assert.equal(reads.at(-1).focus, 68);
    await page.goto(`${base}/tests/write-safety.html?view=composer`);
    const body = page.getByPlaceholder('남기고 싶은 추억을 자유롭게 적어 주세요.');
    await body.waitFor(); assert.equal(await body.getAttribute('maxlength'), '300');
    await body.fill('가'.repeat(300)); await body.press('End'); await body.pressSequentially('나');
    assert.equal((await body.inputValue()).length, 300);
    await page.getByText('300 / 300자', { exact: true }).waitFor();
    await page.goto(`${base}/tests/write-safety.html?view=visual`);
    await page.waitForFunction(() => window.writeAuditFrames?.visual > 0);
    // 이미지의 정상 load 갱신을 입자 타이머 갱신으로 오인하지 않도록 먼저 로딩을 완료한다.
    await page.waitForFunction(() => [...document.images].every(img => img.complete && img.naturalWidth > 0));
    await page.clock.install(); await page.clock.fastForward(1000);
    await page.clock.runFor(100);
    const before = await page.evaluate(() => window.writeAuditFrames.visual);
    await page.clock.fastForward(10000);
    assert.equal(await page.evaluate(() => window.writeAuditFrames.visual), before);
    await page.getByRole('button', { name: '외형 전환', exact: true }).click();
    const basic = await page.evaluate(() => window.writeAuditFrames.visual);
    await page.clock.fastForward(1300);
    assert.ok(await page.evaluate(() => window.writeAuditFrames.visual) > basic);
    await page.getByRole('button', { name: '외형 전환', exact: true }).click();
    await page.waitForFunction(() => [...document.images].every(img => img.complete && img.naturalWidth > 0));
    await page.clock.fastForward(1000);
    await page.clock.runFor(100);
    const switched = await page.evaluate(() => window.writeAuditFrames.visual);
    await page.clock.fastForward(10000);
    assert.equal(await page.evaluate(() => window.writeAuditFrames.visual), switched);
    assert.deepEqual(unexpected, []); assert.deepEqual(errors, []);
    console.log(JSON.stringify({ width, passed: true, commentPages: reads, tests: ['paging', 'retry-preserves-comments', 'deep-reply', 'notification-path', 'create-reply', '300-character-limit', 'custom-particle-stop', 'basic-particle-preserved'] }));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
