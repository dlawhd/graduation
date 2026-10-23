/** 실제 React 화면의 PC·모바일 가독성, 입력 보존, 단일 전송, 읽음·오류 상태를 검증한다.
 * 모든 API와 소켓은 대역이며, 외부 요청은 차단한다. 운영 DB·이메일·유료 AI를 호출하지 않는다.
 */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:3000';
const output = path.resolve(__dirname, '../../build/ui-readability');

(async () => {
  await fs.mkdir(output, { recursive: true });
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  await context.addInitScript(() => { window.__MEMORYJAR_AUDIT_TEST__ = true; });
  const errors = [], unexpected = [], notes = [], chatSends = [];
  let readAll = 0, notificationMode = 'normal', failNote = false, failChat = false, allRead = false;
  const notifications = [
    { notificationId: 1, type: 'NOTE_COMMENTED', message: '내 쪽지에 새 댓글이 달렸어요.', actorName: '하늘', createdAt: '2026-10-21T10:00:00+09:00', isRead: false, jarId: 10 },
    { notificationId: 2, type: 'JAR_MEMBER_JOINED', message: '초대한 멤버가 참여했어요.', actorName: '별', createdAt: '2026-10-20T10:00:00+09:00', isRead: true, jarId: 10 },
  ];
  const jar = { jarId: 10, name: '우리의 작은 순간', description: '함께 모은 소중한 기억을 담아요.', theme: 'DEW', myRole: 'OWNER', isOpen: true, maxMembers: 5, memberCount: 3, noteCount: 0, openAt: '2026-10-01T12:00:00+09:00' };
  await context.routeWebSocket(/.*/, ws => ws.onMessage(frame => {
    if (frame.startsWith('CONNECT')) ws.send('CONNECTED\nversion:1.2\nheart-beat:0,0\n\n\0');
  }));
  await context.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url()), p = url.pathname;
    const ok = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ data }) });
    const failure = message => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { message } }) });
    if (p.startsWith('/api/')) {
      if (p === '/api/v1/me') return ok({ userId: 1, name: '로컬 화면 시험' });
      if (p.endsWith('/csrf')) return ok({ token: 'fixture', headerName: 'X-XSRF-TOKEN' });
      if (p.endsWith('/onboarding')) return ok({ version: 1, items: ['WELCOME', 'JAR_LIST', 'JAR_CREATE', 'JAR_DETAIL', 'JAR_INVITE', 'DAILY_DRAW'].map(tutorialKey => ({ tutorialKey, handled: true, status: 'COMPLETED' })) });
      if (p.endsWith('/support/permissions')) return ok({ operator: false });
      if (p === '/api/v1/jars') return ok({ items: [jar, { ...jar, jarId: 11, name: '친구들과의 봄날', theme: 'SPRING' }, { ...jar, jarId: 12, name: '가족의 하루', theme: 'SAND' }], totalElements: 3, totalPages: 1, page: 0 });
      if (p === '/api/v1/jars/10') return ok(jar);
      if (p.endsWith('/members')) return ok({ items: [{ userId: 1, name: '로컬 화면 시험', role: 'OWNER' }] });
      if (p.endsWith('/invites')) return ok({ items: [] });
      if (p.endsWith('/daily-draw/today')) return ok({ hasTodayDraw: false });
      if (p.endsWith('/daily-draw/history')) return ok({ items: [], totalPages: 0 });
      if (p.endsWith('/unread-count')) return ok({ unreadCount: allRead ? 0 : 1 });
      if (p.endsWith('/chat/unread')) return ok({ unreadCount: 0 });
      if (p === '/api/v1/notifications') return notificationMode === 'error' ? failure('알림 시험 오류') : ok({ items: notificationMode === 'empty' ? [] : notifications.map(n => ({ ...n, isRead: allRead || n.isRead })) });
      if (p.endsWith('/notifications/read-all')) { readAll++; await new Promise(r => setTimeout(r, 150)); allRead = true; return ok({}); }
      if (p === '/api/v1/support/inquiries') return ok({ items: ['OPEN', 'IN_PROGRESS', 'ANSWERED'].map((status, i) => ({ inquiryId: i + 1, status, style: 'WATERCOLOR', description: '스타일 확인을 부탁드려요.', generationId: i + 10 })) });
      if (p.endsWith('/notes') && req.method() === 'GET') return ok({ items: [], totalElements: 0, totalPages: 0 });
      if (p.endsWith('/notes') && req.method() === 'POST') { notes.push(req.postDataJSON()); await new Promise(r => setTimeout(r, 150)); return failNote ? failure('쪽지 저장 시험 오류') : ok({ noteId: 1 }); }
      if (p.endsWith('/chat/messages') && req.method() === 'GET') return ok({ items: [{ messageId: 1, content: '오늘의 추억도 함께 담아요.', senderName: '하늘', createdAt: '2026-10-21T10:00:00+09:00', mine: false }], hasNext: false });
      if (p.endsWith('/chat/messages') && req.method() === 'POST') { chatSends.push(req.postDataJSON()); await new Promise(r => setTimeout(r, 150)); return failChat ? failure('채팅 전송 시험 오류') : ok({ messageId: chatSends.length + 1, content: req.postDataJSON().content, mine: true }); }
      if (p.endsWith('/chat/messages/new')) return ok({ items: [], hasNext: false });
      if (p.endsWith('/chat/read')) return ok({});
      unexpected.push(req.method() + ' ' + p); return failure('시험에 등록되지 않은 요청');
    }
    if (url.origin === base) return route.continue();
    return route.abort();
  });
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  const noOverflow = async () => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, '페이지 가로 넘침 없음');
  const capture = async name => {
    await page.evaluate(() => { window.scrollTo(0, 0); document.querySelector('.paper-compose-scroll')?.scrollTo(0, 0); });
    await page.screenshot({ path: path.join(output, name + '.png'), fullPage: true });
  };
  const inViewport = async locator => { const box = await locator.boundingBox(); assert.ok(box && box.y >= 0 && box.y + box.height <= page.viewportSize().height + 1, '버튼이 화면 안에 있음'); };
  try {
    for (const width of [1440, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(base + '/jars'); await page.locator('.jar-shelf-card').first().waitFor();
      assert.equal(await page.locator('.jar-shelf-progress').count(), 0);
      assert.equal((await page.locator('.jar-shelf-action').first().innerText()).replace(/\s+/g, ' '), '저금통 보기 →');
      assert.equal(await page.locator('.jar-shelf-description').first().evaluate(n => getComputedStyle(n).fontSize), '14px');
      await page.evaluate(() => document.fonts.load('400 16px Pretendard', '추억'));
      assert.equal(await page.evaluate(() => [...document.fonts].some(f => f.family === 'Pretendard' && f.status === 'loaded')), true);
      if (width >= 640) {
        await page.getByRole('link', { name: '내 저금통', exact: true }).waitFor();
        const centered = await page.getByRole('link', { name: '내 저금통', exact: true }).evaluate(n => { const text = document.createRange(); text.selectNodeContents(n); const a = n.getBoundingClientRect(), b = text.getBoundingClientRect(); return Math.abs((a.top + a.bottom) / 2 - (b.top + b.bottom) / 2); });
        assert.ok(centered < 3, '내 저금통 글자 세로 중앙');
        assert.equal(await page.getByRole('button', { name: '로그아웃', exact: true }).count(), 0);
        await page.getByRole('button', { name: /내정보/ }).click();
        await page.locator('#header-profile').getByRole('button', { name: '로그아웃', exact: true }).waitFor();
        const profile = page.locator('#header-profile');
        assert.equal(await profile.locator('.profile-menu-jars').getAttribute('open'), null);
        const accountBox = await profile.locator('.profile-menu-account').boundingBox();
        const logoutBox = await profile.getByRole('button', { name: '로그아웃', exact: true }).boundingBox();
        assert.ok(logoutBox.y > accountBox.y + accountBox.height);
        await capture('profile-' + width);
        await profile.locator('summary').click();
        await profile.getByRole('link', { name: '내 저금통 보러가기', exact: true }).waitFor();
        await page.getByRole('button', { name: /내정보/ }).click();
      }
      await noOverflow(); await capture('shelf-' + width);
      allRead = false; notificationMode = 'normal';
      await page.getByRole('button', { name: '알림 열기' }).click();
      await page.getByText('내 쪽지에 새 댓글이 달렸어요.', { exact: true }).waitFor();
      const panel = page.locator('#header-notifications');
      assert.equal(await panel.getByText('안 읽음', { exact: true }).count(), 1);
      await noOverflow(); await capture('notifications-' + width);
      const beforeRead = readAll;
      await panel.getByRole('button', { name: '모두 읽음' }).evaluate(n => { n.click(); n.click(); });
      await panel.getByText('안 읽은 알림 0개', { exact: true }).waitFor();
      assert.equal(readAll, beforeRead + 1);
      await page.goto(base + '/support/inquiries');
      await page.getByText('✓답변 완료', { exact: true }).waitFor();
      const colors = await Promise.all(['○접수', '◷확인 중', '✓답변 완료'].map(label => page.getByText(label, { exact: true }).evaluate(n => getComputedStyle(n).backgroundColor)));
      assert.equal(new Set(colors).size, 3); await noOverflow();

      await page.goto(base + '/jars/design/new?mode=image-only&step=image');
      const progress = page.locator('.design-progress');
      if (width <= 700) {
        assert.equal(await progress.locator('ol').isVisible(), false);
        await progress.getByRole('button', { name: '전체 단계 보기' }).click();
        await progress.locator('[aria-current="step"]').waitFor();
        await progress.getByRole('button', { name: '전체 단계 접기' }).click();
      } else await progress.locator('[aria-current="step"]').waitFor();
      const canvas = page.getByLabel('저금통 디자인 캔버스', { exact: true });
      await canvas.scrollIntoViewIfNeeded();
      const box = await canvas.boundingBox();
      await page.mouse.move(box.x + box.width * .2, box.y + box.height * .3); await page.mouse.down();
      await page.mouse.move(box.x + box.width * .7, box.y + box.height * .6, { steps: 10 }); await page.mouse.up();
      const drawn = await canvas.evaluate(n => n.toDataURL());
      await page.getByRole('button', { name: '실행 취소', exact: true }).filter({ visible: true }).click();
      assert.notEqual(await canvas.evaluate(n => n.toDataURL()), drawn);
      await page.getByRole('button', { name: '다시 실행', exact: true }).filter({ visible: true }).click();
      assert.equal(await canvas.evaluate(n => n.toDataURL()), drawn);
      await noOverflow(); await capture('studio-' + width);

      await page.goto(base + '/tests/write-safety.html?view=composer');
      const dialog = page.getByRole('dialog', { name: '쪽지 작성', exact: true });
      await dialog.waitFor(); await page.getByPlaceholder('예: 우리 첫 여행').waitFor();
      await inViewport(dialog.getByRole('button', { name: '미리보기 보기', exact: true }));
      await dialog.getByRole('button', { name: '미리보기 보기', exact: true }).click();
      assert.equal(await dialog.locator('[aria-invalid="true"]').count(), 2);
      await page.getByPlaceholder('예: 우리 첫 여행').fill('오늘의 작은 행복');
      await page.getByPlaceholder('남기고 싶은 추억을 자유롭게 적어 주세요.').fill('함께 웃었던 오늘을 오래 기억하고 싶어.');
      assert.equal(await page.getByPlaceholder('예: 서울숲').isVisible(), false);
      await dialog.locator('summary').click(); await page.getByPlaceholder('예: 서울숲').fill('서울숲');
      await dialog.getByRole('button', { name: '지도에서 장소 선택' }).click();
      await dialog.getByText('지도 선택을 준비하고 있어요. 지금은 장소를 직접 적어 주세요.', { exact: true }).waitFor();
      assert.equal(await page.getByPlaceholder('예: 서울숲').inputValue(), '서울숲');
      await dialog.getByRole('button', { name: '접기', exact: true }).click();
      await page.getByPlaceholder('예: 여행, 봄, 웃음').fill('추억, 행복');
      await dialog.locator('summary').click(); await capture('composer-' + width);
      await dialog.getByRole('button', { name: '미리보기 보기', exact: true }).click();
      await dialog.getByRole('button', { name: '다시 수정하기' }).click();
      await dialog.locator('summary').click();
      assert.equal(await page.getByPlaceholder('예: 서울숲').inputValue(), '서울숲');
      assert.equal(await page.getByPlaceholder('예: 여행, 봄, 웃음').inputValue(), '추억, 행복');
      await dialog.getByRole('button', { name: '미리보기 보기', exact: true }).click();
      await dialog.getByRole('button', { name: '제출 확인으로' }).click();
      await dialog.getByText('넣은 쪽지는 수정하거나 삭제할 수 없어요.', { exact: true }).waitFor();
      const beforeNote = notes.length;
      await dialog.getByRole('button', { name: '저금통에 넣기', exact: true }).evaluate(n => { n.click(); n.click(); });
      await page.getByText('쪽지를 저금통에 넣었어요.', { exact: true }).waitFor();
      assert.equal(notes.length, beforeNote + 1); assert.equal(notes.at(-1).location, '서울숲');
      await noOverflow();

      await page.goto(base + '/tests/ui-readability.html');
      const chat = page.getByRole('dialog', { name: '우리의 작은 순간 채팅' });
      await chat.getByText('오늘의 추억도 함께 담아요.', { exact: true }).waitFor();
      assert.equal(await chat.getByText(/WebSocket|Polling/).count(), 0);
      await inViewport(chat.getByRole('button', { name: '전송', exact: true }));
      await chat.getByLabel('채팅 메시지 입력').fill('우리의 추억을 남겨요.');
      const beforeChat = chatSends.length;
      await chat.getByRole('button', { name: '전송', exact: true }).evaluate(n => { n.click(); n.click(); });
      await chat.getByText('우리의 추억을 남겨요.', { exact: true }).waitFor();
      assert.equal(chatSends.length, beforeChat + 1);
      await noOverflow(); await capture('chat-' + width);
      if (width === 390) {
        await page.setViewportSize({ width, height: 480 });
        await inViewport(chat.getByRole('button', { name: '전송', exact: true })); await noOverflow();
      }
    }
    await page.setViewportSize({ width: 390, height: 900 });
    notificationMode = 'error'; await page.goto(base + '/jars');
    await page.getByRole('button', { name: '알림 열기' }).click(); await page.getByText('알림 시험 오류', { exact: true }).waitFor();
    notificationMode = 'empty'; await page.getByRole('button', { name: '다시 시도', exact: true }).click();
    await page.getByText('아직 도착한 알림이 없어요.', { exact: true }).waitFor();
    failChat = true; await page.goto(base + '/tests/ui-readability.html');
    await page.getByLabel('채팅 메시지 입력').fill('실패해도 보존되는 메시지');
    await page.getByRole('button', { name: '전송', exact: true }).click();
    await page.getByText('전송 결과를 확인하지 못했어요. 같은 내용으로 다시 보내도 중복 저장되지 않아요.', { exact: true }).waitFor();
    assert.equal(await page.getByLabel('채팅 메시지 입력').inputValue(), '실패해도 보존되는 메시지');
    failNote = true; await page.goto(base + '/tests/write-safety.html?view=composer');
    await page.getByPlaceholder('예: 우리 첫 여행').fill('저장 실패 시 보존');
    await page.getByPlaceholder('남기고 싶은 추억을 자유롭게 적어 주세요.').fill('입력한 추억은 그대로 남아 있어야 해요.');
    await page.getByRole('button', { name: '미리보기 보기', exact: true }).click();
    await page.getByRole('button', { name: '제출 확인으로' }).click();
    await page.getByRole('button', { name: '저금통에 넣기', exact: true }).click();
    await page.getByText('쪽지 저장 시험 오류', { exact: true }).waitFor();
    assert.equal(await page.getByRole('dialog', { name: '쪽지 작성' }).isVisible(), true);
    assert.deepEqual(unexpected, []); assert.deepEqual(errors, []);
    console.log(JSON.stringify({ status: 'PASSED', widths: [1440, 768, 390, 320], noteSaves: notes.length, chatSends: chatSends.length, readAll, screenshots: output }, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
