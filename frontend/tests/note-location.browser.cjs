/** 실제 작성창에 지도 SDK 대역을 연결해 요청 시점·검색·역순 응답·취소·저장 호환성을 검사한다. 외부 요청은 차단한다. */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:3000';
(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const saved = [], errors = [], unexpected = [];
  await context.addInitScript(() => {
    window.__MEMORYJAR_AUDIT_TEST__ = true;
    window.mapAudit = { maps: 0, searches: 0, addresses: 0 };
    class LatLng { constructor(lat, lng) { this.lat = lat; this.lng = lng; } getLat() { return this.lat; } getLng() { return this.lng; } }
    class Map {
      constructor(node, options) { window.mapAudit.maps++; this.node = node; this.center = options.center; node.onclick = () => this.listener?.({ latLng: new LatLng(37.5445, 127.0374) }); }
      addControl() {} getCenter() { return this.center; } setCenter(p) { this.center = p; } setLevel() {} relayout() {}
    }
    class Marker { setPosition() {} setMap() {} }
    class Places { keywordSearch(q, callback) { window.mapAudit.searches++; setTimeout(() => callback(q === '없음' ? [] : [{ id: '1', place_name: '서울숲', road_address_name: '서울 성동구 뚝섬로 273', x: '127.0374', y: '37.5445' }], q === '없음' ? 'ZERO_RESULT' : q === '오류' ? 'ERROR' : 'OK'), 60); } }
    class Geocoder { coord2Address(x, y, callback) { window.mapAudit.addresses++; setTimeout(() => callback([{ address: { address_name: '늦게 도착한 이전 주소' } }], 'OK'), 200); } }
    window.kakao = { maps: { Map, Marker, LatLng, ZoomControl: class {}, ControlPosition: { RIGHT: 1 }, services: { Places, Geocoder, Status: { OK: 'OK', ZERO_RESULT: 'ZERO_RESULT' } }, event: { addListener(map, event, fn) { map.listener = fn; }, removeListener(map) { map.listener = null; } } } };
  });
  await context.routeWebSocket(/.*/, ws => ws.onMessage(frame => { if (frame.startsWith('CONNECT')) ws.send('CONNECTED\nversion:1.2\nheart-beat:0,0\n\n\0'); }));
  await context.route('**/*', route => {
    const request = route.request(), url = new URL(request.url()), p = url.pathname;
    const ok = data => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data }) });
    if (p.endsWith('/csrf')) return ok({ token: 'fixture', headerName: 'X-XSRF-TOKEN' });
    if (p.endsWith('/notes')) {
      if (request.method() === 'POST') { saved.push(request.postDataJSON()); return ok({ noteId: 42 }); }
      return ok({ items: [], totalElements: 0, totalPages: 0 });
    }
    if (p.startsWith('/api/')) { unexpected.push(p); return ok({}); }
    return url.origin === base ? route.continue() : route.abort();
  });
  const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(base + '/tests/write-safety.html?view=composer');
    const dialog = page.getByRole('dialog', { name: '쪽지 작성' });
    await dialog.waitFor();
    assert.equal(await page.evaluate(() => window.mapAudit.maps), 0);
    await dialog.locator('summary').click();
    const input = page.getByPlaceholder('예: 서울숲');
    await input.fill('직접 적은 장소');
    await page.getByRole('button', { name: '지도에서 장소 선택' }).click();
    await page.getByLabel('지도 장소 검색', { exact: true }).fill('서울숲');
    assert.equal(await page.evaluate(() => window.mapAudit.searches), 0);
    await page.getByRole('button', { name: '검색', exact: true }).evaluate(n => { n.click(); n.click(); });
    await page.getByRole('button', { name: '서울숲 서울 성동구 뚝섬로 273', exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.mapAudit.searches), 1);
    // 지도 클릭의 느린 주소 응답보다 뒤에 선택한 검색 결과가 우선해야 한다.
    await page.locator('.note-map-canvas').click();
    await page.getByRole('button', { name: '서울숲 서울 성동구 뚝섬로 273', exact: true }).click();
    await page.waitForTimeout(250);
    await page.getByText('서울숲 · 서울 성동구 뚝섬로 273', { exact: true }).waitFor();
    assert.equal(await input.inputValue(), '직접 적은 장소');
    await page.getByRole('button', { name: '접기', exact: true }).click();
    assert.equal(await input.inputValue(), '직접 적은 장소');
    await page.getByRole('button', { name: '지도에서 장소 선택' }).click();
    const search = page.getByLabel('지도 장소 검색', { exact: true });
    await search.fill('없음'); await page.getByRole('button', { name: '검색', exact: true }).click();
    await page.getByText('검색 결과가 없어요. 다른 장소 이름으로 찾아보세요.', { exact: true }).waitFor();
    await search.fill('오류'); await page.getByRole('button', { name: '검색', exact: true }).click();
    await page.getByText('장소를 찾지 못했어요. 잠시 후 다시 검색해 주세요.', { exact: true }).waitFor();
    await search.fill('서울숲'); await page.getByRole('button', { name: '검색', exact: true }).click();
    await page.getByRole('button', { name: '서울숲 서울 성동구 뚝섬로 273', exact: true }).click();
    await page.getByRole('button', { name: '이 장소 사용', exact: true }).click();
    assert.equal(await input.inputValue(), '서울숲 · 서울 성동구 뚝섬로 273');
    await page.getByPlaceholder('예: 우리 첫 여행').fill('지도에서 고른 추억');
    await page.getByPlaceholder('남기고 싶은 추억을 자유롭게 적어 주세요.').fill('그날 함께 걸었던 길');
    await page.getByRole('button', { name: '미리보기 보기', exact: true }).click();
    await page.getByText('서울숲 · 서울 성동구 뚝섬로 273', { exact: true }).waitFor();
    await page.getByRole('button', { name: '제출 확인으로' }).click();
    await page.getByRole('button', { name: '저금통에 넣기', exact: true }).click();
    await page.getByText('쪽지를 저금통에 넣었어요.', { exact: true }).waitFor();
    assert.equal(saved.length, 1); assert.equal(saved[0].location, '서울숲 · 서울 성동구 뚝섬로 273');
    assert.deepEqual(errors, []); assert.deepEqual(unexpected, []);
    console.log(JSON.stringify({ result: 'PASS', sdk: '대역', tests: ['지연 로딩', '명시적 검색', '중복 검색 방지', '오래된 주소 응답 무시', '선택 취소', '빈 결과', '검색 오류', '선택 장소 미리보기·저장'] }));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
