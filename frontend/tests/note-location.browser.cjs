/** 실제 작성창에서 네이버 SDK·검색 API 대역으로 선택·취소·역순 응답·저장 호환성을 검사한다. 외부 요청은 차단한다. */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const { mkdirSync } = require('node:fs');
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:3000';
const width = Number(process.env.TEST_VIEWPORT_WIDTH) || 390;
(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
  const saved = [], errors = [], unexpected = [], searches = [];
  await context.addInitScript(() => {
    window.__MEMORYJAR_AUDIT_TEST__ = true;
    window.mapAudit = { maps: 0, destroyed: 0, addresses: 0, geocodes: [], sizes: 0, activeLabels: 0, fitCalls: [], addressMode: 'slow' };
    class LatLng { constructor(lat, lng) { this.lat = lat; this.lng = lng; } }
    class Map {
      constructor(node, options) {
        window.mapAudit.maps++; this.node = node; this.center = options.center;
        node.style.background = '#e7eee0';
        if (options.size) this.setSize(options.size);
        node.onclick = () => this.listener?.({ coord: new LatLng(37.5445, 127.0374) });
      }
      getCenter() { return this.center; } setCenter(p) { this.center = p; } setZoom() {}
      fitBounds(points) { window.mapAudit.fitCalls.push(points.length); this.center = points[0]; }
      // 실제 SDK처럼 크기를 DOM에 반영해야 ResizeObserver가 자기 크기를 줄이는 회귀를 잡을 수 있다.
      setSize(size) { window.mapAudit.sizes++; this.node.style.width = size.width + 'px'; this.node.style.height = size.height + 'px'; }
      destroy() { window.mapAudit.destroyed++; this.node.onclick = null; }
    }
    class Marker {
      constructor(options = {}) { this.node = options.icon?.content; this.map = null; this.setMap(options.map || null); }
      setPosition() {}
      setMap(map) {
        if (this.node && this.map) { this.node.remove(); window.mapAudit.activeLabels--; }
        this.map = map;
        if (this.node && map) { map.node.append(this.node); window.mapAudit.activeLabels++; }
      }
    }
    const Service = {
      Status: { OK: 'OK' },
      geocode({ query }, callback) {
        window.mapAudit.geocodes.push(query);
        if (query.includes('무응답로')) return;
        const found = query.includes('시험로256번길') || query.includes('시험동 123-4') || query === '주소 별칭';
        setTimeout(() => callback(query.includes('권한오류로') ? 'ERROR' : 'OK', { v2: { addresses: found ? [{
          roadAddress: '경기도 용인시 처인구 시험로256번길 47-16', jibunAddress: '경기도 용인시 처인구 시험동 123-4', x: '127.2', y: '37.3',
        }] : [] } }), query.includes('늦은시험로') ? 300 : 40);
      },
      reverseGeocode(options, callback) {
        window.mapAudit.addresses++;
        const mode = window.mapAudit.addressMode;
        setTimeout(() => callback(mode === 'error' ? 'ERROR' : 'OK', { v2: { address: {
          roadAddress: mode === 'parcel' ? '' : mode === 'slow' ? '늦게 도착한 이전 주소' : '서울 성동구 왕십리로 1',
          jibunAddress: '서울 성동구 성수동 1',
        } } }), mode === 'slow' ? 250 : 30);
      },
    };
    window.naver = { maps: { Map, Marker, LatLng, Service, Point: class { constructor(x, y) { this.x = x; this.y = y; } }, Size: class { constructor(width, height) { this.width = width; this.height = height; } }, Position: { TOP_RIGHT: 1 },
      Event: { addListener(map, name, fn) { map.listener = fn; return map; }, removeListener(map) { map.listener = null; } },
    } };
  });
  await context.routeWebSocket(/.*/, ws => ws.onMessage(frame => {
    if (frame.startsWith('CONNECT')) ws.send('CONNECTED\nversion:1.2\nheart-beat:0,0\n\n\0');
  }));
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url()), p = url.pathname;
    const ok = data => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data }) });
    if (p.endsWith('/csrf')) return ok({ token: 'fixture', headerName: 'X-XSRF-TOKEN' });
    if (p.endsWith('/places/search')) {
      const q = url.searchParams.get('q'); searches.push(q);
      await new Promise(resolve => setTimeout(resolve, q === '느림' ? 300 : 70));
      if (q === '오류' || q === '초과') return route.fulfill({ status: q === '오류' ? 503 : 429,
        contentType: 'application/json', body: JSON.stringify({ error: { message: 'fixture' } }) }).catch(() => {});
      const place = { name: q === '긴 이름' ? '긴 장소'.repeat(40) : q === '느림' ? '오래된 결과'
        : q === '태그' ? '상호명 <img src=x onerror="window.markerInjected=true">' : '서울숲',
        address: '서울 성동구 뚝섬로 273', longitude: 127.0374, latitude: 37.5445 };
      return ok(q === '없음' || q === '주소 별칭' ? [] : q === '여러곳' ? [place,
        { name: '함께 카페', address: '서울 성동구 시험로 1', longitude: 127.038, latitude: 37.545 }] : [place]).catch(() => {});
    }
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
    const trigger = page.getByRole('button', { name: '지도에서 장소 선택' });
    const popup = page.getByRole('dialog', { name: '추억이 있는 곳을 골라요' });
    const confirm = page.getByRole('button', { name: '이 장소 사용', exact: true });
    const search = page.getByLabel('지도 장소 검색', { exact: true });
    const searchButton = page.getByRole('button', { name: '검색', exact: true });
    const result = page.getByRole('button', { name: '서울숲 서울 성동구 뚝섬로 273', exact: true });
    async function query(q) { await search.fill(q); await searchButton.click(); }
    await input.fill('직접 적은 장소');
    await trigger.click(); await search.fill('서울숲');
    assert.equal(await popup.evaluate(n => n.matches(':modal')), true);
    assert.equal(await input.evaluate(n => { n.focus(); return document.activeElement === n; }), false);
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('Tab');
      assert.equal(await popup.evaluate(n => n.contains(document.activeElement)), true);
    }
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(100);
    const beforeSizeCalls = await page.evaluate(() => window.mapAudit.sizes);
    const beforeSize = await page.locator('.note-map-canvas').evaluate(n => ({ width: n.clientWidth, height: n.clientHeight }));
    await page.waitForTimeout(400);
    const afterSize = await page.locator('.note-map-canvas').evaluate(n => ({ width: n.clientWidth, height: n.clientHeight }));
    assert.deepEqual(afterSize, beforeSize, '지도는 기다려도 스스로 작아지면 안 된다');
    assert.equal(await page.evaluate(() => window.mapAudit.sizes), beforeSizeCalls);
    assert.ok(afterSize.width >= 220 && afterSize.height >= 230, JSON.stringify(afterSize));
    await page.setViewportSize({ width: Math.max(360, width - 100), height: 600 });
    await page.waitForTimeout(150);
    const resized = await page.locator('.note-map-canvas').evaluate(n => ({ width: n.clientWidth, height: n.clientHeight }));
    await page.waitForTimeout(400);
    assert.deepEqual(await page.locator('.note-map-canvas').evaluate(n => ({ width: n.clientWidth, height: n.clientHeight })), resized);
    assert.ok(resized.width >= 220 && resized.height >= 230, JSON.stringify(resized));
    assert.equal(await confirm.isVisible(), true);
    await page.setViewportSize({ width, height: 1000 }); await page.waitForTimeout(150);
    assert.equal(searches.length, 0);
    await searchButton.evaluate(n => { n.click(); n.click(); });
    await result.waitFor(); assert.equal(searches.length, 1);
    const mapLabel = page.getByRole('button', { name: '지도에서 서울숲 선택', exact: true });
    await mapLabel.waitFor();
    assert.equal(await page.evaluate(() => window.mapAudit.activeLabels), 1);
    // 지도 클릭의 느린 주소 응답보다 뒤에 선택한 상호명 표시가 우선해야 한다.
    await page.locator('.note-map-canvas').click();
    const addressCalls = await page.evaluate(() => window.mapAudit.addresses);
    await mapLabel.click();
    await page.waitForTimeout(300);
    await page.getByText('서울숲, 서울 성동구 뚝섬로 273', { exact: true }).waitFor();
    assert.equal(await mapLabel.getAttribute('aria-pressed'), 'true');
    assert.equal(await result.getAttribute('aria-pressed'), 'true');
    assert.equal(await page.evaluate(() => window.mapAudit.addresses), addressCalls);
    assert.equal(await input.inputValue(), '직접 적은 장소');
    await page.getByRole('button', { name: '장소 선택 닫기', exact: true }).click();
    assert.equal(await input.inputValue(), '직접 적은 장소');
    assert.equal(await trigger.evaluate(n => document.activeElement === n), true);
    assert.equal(await page.evaluate(() => window.mapAudit.activeLabels), 0);
    await trigger.click(); await search.waitFor();
    await page.keyboard.press('Escape');
    await popup.waitFor({ state: 'detached' });
    assert.equal(await dialog.isVisible(), true);
    assert.equal(await input.inputValue(), '직접 적은 장소');
    await trigger.click(); await search.waitFor();
    const mapBounds = await page.locator('.note-map-canvas').boundingBox();
    await page.mouse.move(mapBounds.x + mapBounds.width / 2, mapBounds.y + mapBounds.height / 2);
    await page.mouse.down(); await page.mouse.move(5, 5, { steps: 8 }); await page.mouse.up();
    assert.equal(await popup.isVisible(), true, '지도에서 시작한 드래그는 바깥에서 끝나도 팝업을 닫지 않는다');
    await page.mouse.click(5, 5);
    await popup.waitFor({ state: 'detached' });
    assert.equal(await dialog.isVisible(), true);
    await trigger.click();
    await query('여러곳');
    const cafeLabel = page.getByRole('button', { name: '지도에서 함께 카페 선택', exact: true });
    await cafeLabel.waitFor();
    assert.equal(await page.evaluate(() => window.mapAudit.activeLabels), 2);
    assert.equal(await page.evaluate(() => window.mapAudit.fitCalls.at(-1)), 2);
    await cafeLabel.focus(); await page.keyboard.press('Enter');
    await page.getByText('함께 카페, 서울 성동구 시험로 1', { exact: true }).waitFor();
    assert.equal(await cafeLabel.getAttribute('aria-pressed'), 'true');
    await query('태그');
    const unsafeLabel = page.getByRole('button', { name: '지도에서 상호명 <img src=x onerror="window.markerInjected=true"> 선택', exact: true });
    await unsafeLabel.waitFor();
    assert.equal(await page.locator('.note-map-place-marker img').count(), 0);
    assert.equal(await page.evaluate(() => Boolean(window.markerInjected)), false);
    await query('없음');
    await page.getByText('검색 결과가 없어요. 다른 장소 이름이나 주소로 찾아보세요.', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.mapAudit.activeLabels), 0);
    await query('오류');
    await page.getByText('장소를 찾지 못했어요. 잠시 후 다시 검색하거나 장소를 직접 적어 주세요.', { exact: true }).waitFor();
    await query('초과');
    await page.getByText('검색 요청이 많아요. 잠시 후 다시 검색해 주세요.', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.mapAudit.geocodes.includes('오류') || window.mapAudit.geocodes.includes('초과')), false);

    // 주소는 사업장 검색을 거치지 않고 Geocoding 결과를 목록과 지도에서 선택한다.
    const road = '경기도 용인시 처인구 시험로256번길 47-16';
    const roadLabel = page.getByRole('button', { name: `지도에서 ${road} 선택`, exact: true });
    const beforeAddressSearches = searches.length;
    await search.fill(road);
    const beforeGeocodes = await page.evaluate(() => window.mapAudit.geocodes.length);
    await searchButton.evaluate(n => { n.click(); n.click(); });
    await roadLabel.waitFor();
    assert.equal(searches.length, beforeAddressSearches);
    assert.equal(await page.evaluate(() => window.mapAudit.geocodes.length), beforeGeocodes + 1);
    await roadLabel.click(); await confirm.click();
    assert.equal(await input.inputValue(), road, '주소 검색 결과는 중복 주소나 임의 상호명 없이 저장한다');
    await trigger.click(); await query('경기도 용인시 처인구 시험동 123-4'); await roadLabel.waitFor();
    assert.equal(searches.length, beforeAddressSearches);
    await query('주소 별칭'); await roadLabel.waitFor();
    assert.equal(await page.evaluate(() => window.mapAudit.geocodes.at(-1)), '주소 별칭', '상호명 검색이 빈 경우에만 주소로 보완한다');
    const fallbackBefore = searches.length;
    await query('시험로 999'); await result.waitFor();
    assert.equal(searches.length, fallbackBefore + 1, '주소가 없으면 상호명 검색을 한 번 확인한다');
    const errorBefore = searches.length;
    await query('권한오류로 1');
    await page.getByText('주소를 찾지 못했어요. 잠시 후 다시 검색하거나 장소를 직접 적어 주세요.', { exact: true }).waitFor();
    assert.equal(searches.length, errorBefore, '주소 권한 오류는 다른 API로 우회하지 않는다');
    await query('무응답로 1');
    await page.getByText('주소 검색이 늦어지고 있어요. 잠시 후 다시 검색하거나 장소를 직접 적어 주세요.', { exact: true }).waitFor({ timeout: 10000 });
    assert.equal(searches.length, errorBefore);
    await query('늦은시험로256번길 1'); await query('서울숲'); await result.waitFor(); await page.waitForTimeout(350);
    assert.equal(await roadLabel.count(), 0, '늦은 주소 결과는 최근 검색을 덮어쓰지 않는다');
    await query('늦은시험로256번길 1'); await popup.getByRole('button', { name: '취소', exact: true }).click();
    await trigger.click(); await page.waitForTimeout(350);
    assert.equal(await roadLabel.count(), 0, '닫은 팝업의 주소 응답을 사용하지 않는다');
    await page.evaluate(() => { window.mapAudit.addressMode = 'error'; });
    await page.locator('.note-map-canvas').click();
    await page.getByText('이 위치의 주소를 찾지 못했어요. 다른 위치를 고르거나 장소를 직접 적어 주세요.', { exact: true }).waitFor();
    assert.equal(await confirm.isDisabled(), true);
    await page.evaluate(() => { window.mapAudit.addressMode = 'parcel'; });
    await page.locator('.note-map-canvas').click();
    await page.getByText('서울 성동구 성수동 1', { exact: true }).waitFor(); await confirm.click();
    assert.equal(await input.inputValue(), '서울 성동구 성수동 1');
    await trigger.click();
    await page.evaluate(() => { window.mapAudit.addressMode = 'success'; });
    await page.locator('.note-map-canvas').click();
    await page.getByText('서울 성동구 왕십리로 1', { exact: true }).waitFor(); await confirm.click();
    assert.equal(await input.inputValue(), '서울 성동구 왕십리로 1');
    await trigger.click(); await query('느림');
    await search.fill('서울숲'); await search.press('Enter'); await result.waitFor(); await page.waitForTimeout(350);
    assert.equal(await page.getByText('오래된 결과', { exact: true }).count(), 0);
    await query('긴 이름'); await page.getByText('장소가 100자를 넘어요. 장소 칸에 필요한 이름과 주소를 직접 적어 주세요.', { exact: true }).count();
    await page.getByRole('button', { name: /긴 장소.*서울 성동구/ }).click();
    assert.equal(await confirm.isDisabled(), true);
    await query('느림'); await popup.getByRole('button', { name: '취소', exact: true }).click();
    await trigger.click(); await page.waitForTimeout(350);
    assert.equal(await page.getByText('오래된 결과', { exact: true }).count(), 0);
    assert.equal(await input.inputValue(), '서울 성동구 왕십리로 1');
    await query('서울숲'); await result.click();
    const panel = popup;
    assert.equal(await panel.evaluate(n => n.scrollWidth <= n.clientWidth + 1), true);
    assert.equal(await page.locator('.note-map-canvas').evaluate(n => n.clientWidth >= 220), true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    mkdirSync('build/map-verification', { recursive: true });
    await panel.screenshot({ path: 'build/map-verification/naver-location-' + width + '.png' });
    await confirm.click();
    assert.equal(await input.inputValue(), '서울숲, 서울 성동구 뚝섬로 273');
    assert.equal(await input.evaluate(n => document.activeElement === n), true);
    await page.getByPlaceholder('예: 우리 첫 여행').fill('지도에서 고른 추억');
    await page.getByPlaceholder('남기고 싶은 추억을 자유롭게 적어 주세요.').fill('그날 함께 걸었던 길');
    await page.getByRole('button', { name: '미리보기 보기', exact: true }).click();
    await page.getByText('서울숲, 서울 성동구 뚝섬로 273', { exact: true }).waitFor();
    await page.getByRole('button', { name: '제출 확인으로' }).click();
    await page.getByRole('button', { name: '저금통에 넣기', exact: true }).click();
    await page.getByText('쪽지를 저금통에 넣었어요.', { exact: true }).waitFor();
    assert.equal(saved.length, 1); assert.equal(saved[0].location, '서울숲, 서울 성동구 뚝섬로 273');
    const audit = await page.evaluate(() => window.mapAudit);
    assert.equal(audit.destroyed, audit.maps);
    assert.equal(audit.activeLabels, 0);
    assert.deepEqual(errors, []); assert.deepEqual(unexpected, []);

    // 주소도 기존 location 문자열 그대로 미리보기·저장되는지 별도의 작성창에서 확인한다.
    await page.goto(base + '/tests/write-safety.html?view=composer');
    await page.getByRole('dialog', { name: '쪽지 작성' }).locator('summary').click();
    await trigger.click(); await query(road);
    await page.getByRole('button', { name: `${road} 경기도 용인시 처인구 시험동 123-4`, exact: true }).click();
    await confirm.click();
    assert.equal(await input.inputValue(), road);
    await page.getByPlaceholder('예: 우리 첫 여행').fill('주소로 고른 추억');
    await page.getByPlaceholder('남기고 싶은 추억을 자유롭게 적어 주세요.').fill('주소 선택 저장 확인');
    await page.getByRole('button', { name: '미리보기 보기', exact: true }).click();
    await page.getByText(road, { exact: true }).waitFor();
    await page.getByRole('button', { name: '제출 확인으로' }).click();
    await page.getByRole('button', { name: '저금통에 넣기', exact: true }).click();
    await page.getByText('쪽지를 저금통에 넣었어요.', { exact: true }).waitFor();
    assert.equal(saved.length, 2); assert.equal(saved[1].location, road);
    assert.equal(await page.evaluate(() => window.mapAudit.activeLabels), 0);
    assert.deepEqual(errors, []); assert.deepEqual(unexpected, []);

    // 키가 없거나 SDK를 불러올 수 없어도 기존 장소 직접 입력은 정상 동작해야 한다.
    const fallback = await browser.newContext({ viewport: { width, height: 1000 } });
    await fallback.addInitScript(() => { window.__MEMORYJAR_AUDIT_TEST__ = true; });
    await fallback.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.pathname.startsWith('/api/')) return route.fulfill({ contentType: 'application/json', body: '{"data":{}}' });
      return url.origin === base ? route.continue() : route.abort();
    });
    const fallbackPage = await fallback.newPage();
    await fallbackPage.goto(base + '/tests/write-safety.html?view=composer');
    await fallbackPage.getByRole('dialog', { name: '쪽지 작성' }).locator('summary').click();
    await fallbackPage.getByPlaceholder('예: 서울숲').fill('직접 적은 장소');
    await fallbackPage.getByRole('button', { name: '지도에서 장소 선택' }).click();
    await fallbackPage.getByRole('alert').waitFor();
    assert.equal(await fallbackPage.getByPlaceholder('예: 서울숲').inputValue(), '직접 적은 장소');
    await fallbackPage.getByRole('button', { name: '장소 선택 닫기' }).click();
    await fallbackPage.getByPlaceholder('예: 서울숲').fill('지도 없이 수정한 장소');
    assert.equal(await fallbackPage.getByPlaceholder('예: 서울숲').inputValue(), '지도 없이 수정한 장소');
    await fallback.close();
    console.log(JSON.stringify({ result: 'PASS', width, sdk: '네이버 대역', searches: searches.length,
      tests: ['지연 로딩', '명시적 검색', '중복 검색 방지', '오래된 주소 무시', '취소·접기', '빈 결과',
        '검색 503·429', '주소 조회 실패', '지번 주소', '도로명 주소', '오래된 검색 무시', '100자 제한',
        '닫기 후 응답 무시', '가로 넘침 없음', '선택 장소 미리보기·저장', '지도 자원 해제', '지도 미설정·실패 시 직접 입력',
        '대기 중 지도 크기 유지', '크기 변경 후 안정화', 'native 팝업·배경 차단', 'Tab 초점 유지',
        'Escape는 지도만 닫기', '배경 클릭 닫기', '드래그는 닫지 않음', '닫기·선택 후 초점 복구',
        '상호명 지도 표시 클릭', '목록·지도 선택 동기화', '지도 표시 Enter 선택', '검색 결과 범위 이동',
        '검색 변경·닫기 후 표시 해제', '상호명 HTML 실행 방지', '쉼표 형식 미리보기·저장',
        '도로명 검색·지도 선택·주소 입력', '지번 검색', '주소 중복 요청 방지', '빈 결과 보완 양방향',
        '권한·쿼터 오류 우회 없음', '주소 시간 초과', '늦은 주소 검색 무시', '닫기 후 주소 검색 무시', '주소 결과 목록 선택·미리보기·저장'] }));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
