/** 실제 React·Axios·STOMP 코드의 조회/전송/갱신 회귀 시험. 운영·유료 서비스 요청은 전부 차단한다. */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:3001';
(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const width = Number(process.env.TEST_VIEWPORT_WIDTH) || 1440;
  const context = await browser.newContext({ viewport: { width, height: width < 600 ? 844 : 1100 }, reducedMotion: 'reduce' });
  await context.addInitScript(() => { window.__MEMORYJAR_AUDIT_TEST__ = true; });
  const errors = [], noteCalls = [], cursors = [], reads = [], sends = [], historyCalls = [];
  let socket, subscription, latest = 100, failAfterSave = false, failSend = false, refreshMode = 'network';
  const savedMessages = new Map(), savedRequests = new Map();
  const message = id => savedMessages.get(id) || ({ messageId: id, jarId: 10, senderId: 2, senderName: '친구', type: 'TEXT', content: `메시지-${id}`, createdAt: '2026-10-04T10:00:00', mine: false });
  await context.routeWebSocket(/.*/, ws => {
    socket = ws;
    ws.onMessage(frame => {
      if (frame.startsWith('CONNECT')) ws.send('CONNECTED\nversion:1.2\nheart-beat:0,0\n\n\0');
      if (frame.startsWith('SUBSCRIBE')) subscription = /id:([^\n]+)/.exec(frame)?.[1];
    });
  });
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url()), p = url.pathname;
    const ok = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ data }) });
    if (p.startsWith('/api/')) {
      if (p.endsWith('/csrf')) return ok({ token: 'fixture', headerName: 'X-XSRF-TOKEN' });
      if (p.endsWith('/auth/refresh')) {
        if (refreshMode === 'network') return route.abort();
        return route.fulfill({ status: refreshMode === 'expired' ? 401 : 503, body: JSON.stringify({ error: { message: '시험 오류' } }) });
      }
      if (p === '/api/v1/probe') return route.fulfill({ status: 401, body: '{}' });
      if (p.endsWith('/invites') && request.method() === 'POST') return route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ message: '초대 생성 제한 안내' }) });
      if (p.endsWith('/unread-count')) return ok({ unreadCount: 0 });
      if (p.endsWith('/daily-draw/today')) return ok({ hasTodayDraw: false, remainingCount: 25, hasRemainingNotes: true, totalDrawableCount: 50, drawnCount: 25 });
      if (p.endsWith('/daily-draw/history')) {
        const page = Number(url.searchParams.get('page')); historyCalls.push(page);
        return ok({ page, totalElements: 25, totalPages: 5, items: Array.from({ length: 5 }, (_, i) => ({ drawId: page * 5 + i + 1, noteId: i + 1, title: `기록-${page * 5 + i + 1}`, drawDate: '2026-10-04' })) });
      }
      if (p.endsWith('/notes')) {
        const page = Number(url.searchParams.get('page')), q = url.searchParams.get('q') || '', tag = url.searchParams.get('tag') || '';
        noteCalls.push({ page, q, tag });
        return ok({ page, totalElements: q || tag ? 1 : 28, totalPages: q || tag ? 1 : 10,
          items: Array.from({ length: q || tag ? 1 : page === 9 ? 1 : 3 }, (_, i) => ({ noteId: page * 3 + i + 1, title: q || tag ? '본문에서 검색됨' : `쪽지-${page * 3 + i + 1}`, previewContent: '30자 미리보기', tags: [], attachments: [], reactionCounts: [] })) });
      }
      if (p.endsWith('/chat/messages') && request.method() === 'GET') return ok({ items: Array.from({ length: 30 }, (_, i) => message(i + 1)), firstUnreadMessageId: 1, hasNext: false });
      if (p.endsWith('/chat/messages/new')) {
        const after = Number(url.searchParams.get('afterMessageId')); cursors.push(after);
        // 첫 페이지 응답 직후 live 100번을 보내므로 이후 31~99번의 누락 여부를 검증한다.
        return ok({ items: Array.from({ length: Math.min(30, latest - after) }, (_, i) => message(after + i + 1)), hasNext: after + 30 < latest });
      }
      if (p.endsWith('/chat/read')) {
        reads.push(request.postDataJSON().lastReadMessageId);
        if (failAfterSave) return route.fulfill({ status: 503, body: '{}' });
        return ok({ ok: true });
      }
      if (p.endsWith('/chat/messages') && request.method() === 'POST') {
        const payload = request.postDataJSON(); sends.push(payload);
        if (failSend) return route.abort();
        // 저장 응답과 이후 조회가 같은 메시지를 반환하도록 실제 서버의 멱등 계약을 재현한다.
        let saved = savedRequests.get(payload.requestId);
        if (!saved) {
          saved = { ...message(++latest), content: payload.content, mine: true };
          savedMessages.set(latest, saved);
          savedRequests.set(payload.requestId, saved);
        }
        return ok(saved, 201);
      }
      return ok({ items: [] });
    }
    if (url.origin === base) return route.continue();
    return route.abort();
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(base + '/tests/audit-regressions.html');
    await page.getByText('쪽지-1', { exact: true }).first().waitFor();
    for (let i = 0; i < 9; i++) {
      await page.getByRole('button', { name: '다음', exact: true }).click();
      await page.getByText(`쪽지-${(i + 1) * 3 + 1}`, { exact: true }).first().waitFor();
    }
    assert.ok(noteCalls.some(item => item.page === 9));
    await page.getByPlaceholder('제목이나 내용으로 찾아보기').fill('본문후반');
    await page.getByRole('button', { name: '검색', exact: true }).click();
    await page.getByText('본문에서 검색됨', { exact: true }).first().waitFor();
    assert.ok(noteCalls.some(item => item.q === '본문후반' && item.page === 0));
    await page.getByPlaceholder('제목이나 내용으로 찾아보기').fill('');
    await page.getByPlaceholder('태그로 찾아보기').fill('태그후반');
    await page.getByRole('button', { name: '검색', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('button[type="submit"]')?.disabled);
    assert.ok(noteCalls.some(item => item.tag === '태그후반' && item.page === 0));
    const beforeLocked = noteCalls.length;
    await page.goto(base + '/tests/audit-regressions.html?view=locked');
    await page.getByText('LOCKED', { exact: true }).waitFor();
    await page.waitForTimeout(100);
    assert.equal(noteCalls.length, beforeLocked, '잠긴 저금통을 열 때 목록이나 본문 검색을 요청하지 않는다');
    await page.evaluate(() => { window.expiredEvents = 0; window.addEventListener('memoryjar:session-expired', () => window.expiredEvents++); });
    assert.equal(await page.evaluate(() => window.auditApiProbe()), 'temporary');
    assert.equal(await page.evaluate(() => window.expiredEvents), 0);
    refreshMode = 'server'; assert.equal(await page.evaluate(() => window.auditApiProbe()), 'temporary');
    assert.equal(await page.evaluate(() => window.expiredEvents), 0);
    refreshMode = 'expired'; assert.equal(await page.evaluate(() => window.auditApiProbe()), 'SESSION_EXPIRED');
    assert.equal(await page.evaluate(() => window.expiredEvents), 1);
    await page.goto(base + '/tests/audit-regressions.html?view=history');
    await page.getByText('기록-1', { exact: true }).waitFor();
    for (let i = 1; i <= 4; i++) {
      await page.getByRole('button', { name: '다음', exact: true }).click();
      await page.getByText(`기록-${i * 5 + 1}`, { exact: true }).waitFor();
    }
    assert.ok(historyCalls.includes(4));
    await page.goto(base + '/tests/audit-regressions.html?view=chat');
    await page.getByText('메시지-30', { exact: true }).waitFor();
    await page.waitForFunction(() => !document.body.textContent.includes('WebSocket 연결 전에는'));
    assert.ok(socket && subscription);
    const body = JSON.stringify(message(100));
    socket.send(`MESSAGE\nsubscription:${subscription}\ndestination:/topic/jars/10/chat\nmessage-id:100\ncontent-type:application/json\n\n${body}\0`);
    await page.getByText('메시지-100', { exact: true }).waitFor();
    for (let i = 0; i < 4; i++) {
      const more = page.getByRole('button', { name: '이후 채팅 더 보기', exact: true });
      if (await more.count()) { await more.click(); await page.waitForTimeout(150); }
    }
    await page.getByText('메시지-99', { exact: true }).waitFor();
    assert.ok(cursors.includes(30) && cursors.includes(60) && cursors.includes(90), JSON.stringify(cursors));
    failAfterSave = true;
    const draft = page.getByPlaceholder('채팅을 입력해 주세요.');
    await draft.fill('읽음 장애에도 전송 성공');
    await page.getByRole('button', { name: '전송', exact: true }).click();
    await page.getByText('읽음 장애에도 전송 성공', { exact: true }).waitFor();
    assert.equal(await draft.inputValue(), '');
    failSend = true;
    await draft.fill('응답 유실 재시도');
    await page.getByRole('button', { name: '전송', exact: true }).click();
    await page.waitForTimeout(200); assert.equal(await draft.inputValue(), '응답 유실 재시도');
    failSend = false;
    await page.getByRole('button', { name: '전송', exact: true }).click();
    await page.getByText('응답 유실 재시도', { exact: true }).waitFor();
    assert.equal(sends.at(-1).requestId, sends.at(-2).requestId);
    await page.goto(base + '/tests/audit-regressions.html?view=invite');
    const dialogPromise = page.waitForEvent('dialog');
    await page.getByRole('button', { name: '초대 오류 시험' }).click();
    const dialog = await dialogPromise;
    assert.equal(dialog.message(), '초대 생성 제한 안내'); await dialog.dismiss();
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ result: 'PASS', width, notesPages: 10, historyPages: 5, cursors, sends: sends.length, browserErrors: errors.length }));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
