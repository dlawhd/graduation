/** 로컬 Vite 화면을 실제 Chromium으로 조작한다. 모든 API/이미지/소켓은 가짜 응답이며 운영 호출은 차단한다.
 * 실행: 로컬 dev 서버 실행 후 PLAYWRIGHT_MODULE(선택)에 설치된 모듈 경로를 지정하고 node 이파일.
 * 결과 PNG는 저장소 build/design-studio에 기록한다. API 통합 검증이 아닌 UI 회귀 테스트다.
 */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs/promises');
const { createHash } = require('node:crypto');
const output = path.resolve(__dirname, '../../build/design-studio');
const base = 'http://127.0.0.1:3000';

(async () => {
  await fs.mkdir(output, { recursive: true });
  const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || 'chrome' });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1440 }, reducedMotion: 'reduce', hasTouch: true });
  const errors = [], calls = [], generatedStyles = [];
  let finalizes = 0, failFinalize = false, savedSlot;
  let draft = { draftId: 10, status: 'ACTIVE', selectedDesignType: null, selectedGenerationId: null,
    slotCenterX: null, slotCenterY: null, slotSizeRatio: null, slotStyle: 'CAPSULE', generations: [], cutoutRegions: [] };
  // 외부 이미지 요청 없이 서로 구분되는 로컬 SVG 테스트 이미지를 반환한다.
  const artwork = (color) => `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="480"><rect width="480" height="480" fill="white"/><path d="M240 370C40 260 95 65 240 175C385 65 440 260 240 370Z" fill="${color}" stroke="#be185d" stroke-width="8"/><circle cx="202" cy="243" r="9" fill="#334155"/><circle cx="278" cy="243" r="9" fill="#334155"/><path d="M217 278Q240 299 263 278" fill="none" stroke="#334155" stroke-width="6" stroke-linecap="round"/></svg>`;
  await context.routeWebSocket(/.*/, () => {});
  await context.route('**/*', async (route) => {
    const request = route.request(), url = new URL(request.url()), p = url.pathname;
    const json = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ data }) });
    if (p.startsWith('/fixture/')) return route.fulfill({ contentType: 'image/svg+xml', body: artwork(p.includes('candidate') ? '#c4b5fd' : '#f9a8d4') });
    if (p.startsWith('/api/')) {
      calls.push({ method: request.method(), path: p });
      if (p === '/api/v1/me') return json({ userId: 999, name: 'UI 테스트', email: 'test@example.test' });
      if (p.endsWith('/onboarding')) return json({ version: 1, items: ['WELCOME', 'JAR_LIST', 'JAR_CREATE', 'JAR_DETAIL', 'JAR_INVITE', 'DAILY_DRAW'].map((tutorialKey) => ({ tutorialKey, handled: true, status: 'COMPLETED' })) });
      if (p.endsWith('/csrf')) return json({ token: 'local-test-only', headerName: 'X-XSRF-TOKEN' });
      if (p.endsWith('/unread-count')) return json({ unreadCount: 0 });
      if (p === '/api/v1/design-drafts' && request.method() === 'POST') return json({ draftId: 10 }, 201);
      if (p === '/api/v1/design-drafts/10') return json(draft);
      if (p.endsWith('/preview')) return json({ previewUrl: base + (p.includes('original') ? '/fixture/original.svg' : '/fixture/candidate.svg') });
      if (p.endsWith('/generations') && request.method() === 'POST') {
        const payload = request.postDataJSON();
        generatedStyles.push(payload.style);
        draft.generations.push({ generationId: 101, status: 'SUCCEEDED', style: payload.style });
        return json({ generationId: 101 }, 202);
      }
      if (p.endsWith('/selection')) {
        const data = request.postDataJSON(); draft = { ...draft, selectedDesignType: data.designType, selectedGenerationId: data.generationId || null, slotCenterX: null, slotCenterY: null, slotSizeRatio: null, slotStyle: 'CAPSULE' };
        return route.fulfill({ status: 204 });
      }
      if (p.endsWith('/slot')) {
        savedSlot = request.postDataJSON();
        draft = { ...draft, slotCenterX: savedSlot.centerX, slotCenterY: savedSlot.centerY, slotSizeRatio: savedSlot.sizeRatio, slotStyle: savedSlot.slotStyle };
        return route.fulfill({ status: 204 });
      }
      if (p.endsWith('/finalize') || p === '/api/v1/jars' && request.method() === 'POST') {
        finalizes++;
        if (failFinalize) return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { code: 'TEST_UNAVAILABLE', message: '테스트 저장 오류' } }) });
        return json({ jarId: 999, designType: draft.selectedDesignType }, 201);
      }
      if (p === '/api/v1/jars/999') return json(null);
      return json({ content: [], totalElements: 0 });
    }
    if (url.origin === base) return route.continue();
    return route.abort(); // 실제 로그인, S3, AI 호출·외부 리소스 로드 금지
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  const button = (name) => page.getByRole('button', { name, exact: true });
  const canvas = page.getByLabel('저금통 디자인 캔버스', { exact: true });
  const pixels = () => canvas.evaluate((node) => [...node.getContext('2d').getImageData(0, 0, 480, 480).data].filter((v, i) => i % 4 !== 3 && v !== 255).length);
  const fingerprint = async () => createHash('sha256').update(await canvas.evaluate((node) => node.toDataURL())).digest('hex');
  async function stroke(x1, y1, x2, y2) {
    await canvas.scrollIntoViewIfNeeded(); const r = await canvas.boundingBox();
    await page.mouse.move(r.x + x1 / 480 * r.width, r.y + y1 / 480 * r.height);
    await page.mouse.down(); await page.mouse.move(r.x + x2 / 480 * r.width, r.y + y2 / 480 * r.height, { steps: 12 }); await page.mouse.up();
  }
  try {
    await page.goto(base + '/jars/design/new');
    await canvas.waitFor();
    await button('펜 ⌄').click(); assert.equal(await page.getByLabel('펜 종류').getByRole('button').count(), 6);
    await button('마커').click(); await stroke(80, 90, 380, 130); assert.ok(await pixels() > 0);
    const first = await fingerprint();
    await button('실행 취소').click(); assert.equal(await pixels(), 0);
    await button('다시 실행').click(); assert.equal(await fingerprint(), first);
    await button('도형 ⌄').click(); assert.equal(await page.getByLabel('도형 종류').getByRole('button').count(), 18);
    await button('하트').click(); await page.getByLabel('내부 채우기', { exact: true }).check(); await stroke(110, 160, 350, 390);
    await button('이 그림 사용하기 →').click(); await page.getByAltText('선택한 디자인 원본 미리보기').waitFor();
    await button('지우개').click(); await stroke(200, 220, 280, 220);
    assert.equal(await button('이 그림으로 다음 단계 →').isDisabled(), true, '수정한 그림을 확정하기 전 이전 PNG 업로드 방지');
    await button('실행 취소').click();
    await button('텍스트').click(); await page.getByLabel('그림에 넣을 글자').fill('우리의 추억'); await stroke(135, 405, 135, 405);
    const artworkBeforeTools = await fingerprint();
    await button('격자 표시').click(); assert.equal(await fingerprint(), artworkBeforeTools, '격자를 PNG에 합성하지 않음');
    await button('격자 표시').click();
    await button('채우기').click(); await stroke(10, 10, 10, 10); assert.notEqual(await fingerprint(), artworkBeforeTools);
    await button('실행 취소').click();
    await button('스포이드').click(); await stroke(10, 10, 10, 10); assert.equal(await page.getByLabel('사용자 지정 색상').inputValue(), '#ffffff');
    await button('선택').click(); await stroke(50, 60, 410, 145); await stroke(200, 100, 200, 155);
    await page.getByRole('region', { name: '그림판', exact: true }).screenshot({ path: path.join(output, 'selection-regression.png') });
    assert.notEqual(await fingerprint(), artworkBeforeTools, '선택 영역 이동');
    await button('선택 영역 삭제').click(); await button('실행 취소').click(); await button('실행 취소').click();
    assert.equal(await fingerprint(), artworkBeforeTools, '선택 이동/삭제 실행 취소');
    await button('좌우 반전').click(); await button('좌우 반전').click();
    assert.equal(await fingerprint(), artworkBeforeTools, '반전 원본 픽셀 보존');
    const download = page.waitForEvent('download'); await button('PNG 내려받기').click(); assert.equal((await download).suggestedFilename(), 'memory-jar-drawing.png');
    await button('색상 #1e293b').click(); await button('펜 ⌄').click();
    await page.getByRole('region', { name: '그림판', exact: true }).screenshot({ path: path.join(output, '01-paint-desktop.png') });
    await button('이 그림 사용하기 →').click(); await button('이 그림으로 다음 단계 →').click();
    await button('선택한 스타일로 한 장 만들기 ✦').waitFor();
    // 화면 이름을 바꿔도 기존 서버 스타일 ID를 보내고 필터·후보 이름까지 일관되게 표시한다.
    const bizarreStyle = page.getByRole('button', { name: /^기괴 원본을 알아볼 수 있는/ });
    await bizarreStyle.click(); assert.equal(await bizarreStyle.getAttribute('aria-pressed'), 'true');
    assert.equal(await page.getByLabel('후보 필터').getByRole('option', { name: '기괴', exact: true }).getAttribute('value'), 'WEIRDO');
    await button('선택한 스타일로 한 장 만들기 ✦').click(); await button('확대 · 원본과 비교').waitFor();
    assert.deepEqual(generatedStyles, ['WEIRDO'], '기괴 생성은 기존 WEIRDO 계약을 유지');
    assert.equal(await page.locator('article').filter({ has: button('이 후보 선택') }).getByText('기괴', { exact: true }).count(), 1);
    await page.getByRole('heading', { name: '원본을 어떤 분위기로 바꿔볼까요?' }).evaluate((node) => node.scrollIntoView({ block: 'start' }));
    await page.evaluate(() => window.scrollBy(0, -110));
    await page.screenshot({ path: path.join(output, '02-candidate-gallery.png') });
    await button('확대 · 원본과 비교').click(); await page.getByRole('dialog').waitFor();
    await page.getByRole('dialog').screenshot({ path: path.join(output, '02-compare.png') });
    await page.keyboard.press('Escape'); await page.getByRole('dialog').waitFor({ state: 'hidden' });
    await button('이 후보 선택').click();
    await button('은빛 테두리').click(); await button('가운데로 초기화').click();
    assert.equal(await button('은빛 테두리').getAttribute('aria-pressed'), 'true');
    await button('투입구 저장').click(); await page.getByText('투입구 모양과 위치가 저장됐어요.', { exact: true }).waitFor();
    assert.equal(savedSlot.slotStyle, 'METAL'); assert.equal(savedSlot.expectedGenerationId, 101);
    await page.getByRole('region', { name: '동전 투입구 편집', exact: true }).screenshot({ path: path.join(output, '03-slots.png') });
    await page.reload(); await button('은빛 테두리').waitFor(); assert.equal(await button('은빛 테두리').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('article').getByText('기괴', { exact: true }).count(), 1, '기존 WEIRDO 후보도 새 화면 이름으로 표시');
    await page.getByLabel('저금통 이름', { exact: true }).fill('우리의 가을 편지');
    await button('가을').click(); await button('100일 뒤').click();
    await page.getByRole('region', { name: '최종 미리보기와 저금통 만들기', exact: true }).screenshot({ path: path.join(output, '04-final-preview.png') });
    const before = Date.now(); await button('이 디자인으로 저금통 만들기').evaluate((node) => { node.click(); node.click(); });
    await page.getByRole('dialog', { name: '저금통을 만들고 있어요' }).waitFor();
    await page.keyboard.press('Escape'); assert.equal(await page.getByRole('dialog').isVisible(), true);
    await page.getByRole('dialog').screenshot({ path: path.join(output, '05-creating.png') });
    await page.waitForURL('**/jars/999'); assert.ok(Date.now() - before >= 4900); assert.equal(finalizes, 1);
    // 오류는 5초 기다리지 않고 보여주며 폼을 보존한다.
    failFinalize = true; await page.goto(base + '/jars/design/new?draft=10');
    await page.getByLabel('저금통 이름', { exact: true }).fill('오류 후에도 남는 이름'); await button('일주일 뒤').click();
    const failedAt = Date.now(); await button('이 디자인으로 저금통 만들기').click();
    await page.getByText('테스트 저장 오류', { exact: true }).waitFor(); assert.ok(Date.now() - failedAt < 4900);
    assert.equal(await page.getByLabel('저금통 이름', { exact: true }).inputValue(), '오류 후에도 남는 이름');
    assert.equal(finalizes, 2);
    // 좁은 휴대폰에서도 전체 문서의 가로 스크롤이 생기지 않아야 한다.
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), '후보/최종 모바일 가로 넘침');
    await page.getByRole('region', { name: '최종 미리보기와 저금통 만들기', exact: true }).evaluate((node) => node.scrollIntoView({ block: 'start' }));
    await page.evaluate(() => window.scrollBy(0, -90));
    await page.screenshot({ path: path.join(output, '06-final-mobile.png') });
    await page.goto(base + '/jars/design/new'); await canvas.waitFor();
    await button('도형 ⌄').click(); await page.getByLabel('도형 종류').waitFor();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), '그림판 모바일 가로 넘침');
    await page.getByRole('region', { name: '그림판', exact: true }).screenshot({ path: path.join(output, '07-paint-mobile.png') });
    await button('도형 ⌄').click(); await button('펜 ⌄').click(); await button('둥근 펜').click();
    await canvas.scrollIntoViewIfNeeded(); const touchBounds = await canvas.boundingBox();
    await page.touchscreen.tap(touchBounds.x + touchBounds.width / 2, touchBounds.y + touchBounds.height / 2);
    assert.ok(await pixels() > 0, '모바일 터치로 점 그리기');
    failFinalize = false; await page.goto(base + '/jars/new?mode=default');
    await page.locator('input[name="name"]').fill('기본 저금통 테스트');
    const later = new Date(Date.now() + 86400000 * 30).toISOString().slice(0, 16);
    await page.locator('input[name="openAt"]').fill(later);
    const defaultStarted = Date.now(); await page.locator('button[type="submit"]').click();
    await page.getByRole('dialog', { name: '저금통을 만들고 있어요' }).waitFor();
    await page.getByRole('dialog').screenshot({ path: path.join(output, '08-default-creating-mobile.png') });
    await page.waitForURL('**/jars/999'); assert.ok(Date.now() - defaultStarted >= 4900); assert.equal(finalizes, 3);
    assert.deepEqual(errors, [], '브라우저 렌더링 예외');
    console.log(JSON.stringify({ result: 'PASS', apiMode: 'mock-only', requests: calls.length, finalizes, screenshots: output }));
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
