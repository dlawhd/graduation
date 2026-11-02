/** 실제 문의 컴포넌트를 PC/모바일 Chrome에서 검사한다. 로컬 대역 외 모든 요청은 차단한다. */
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:3001';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});const passed=[];
 try {
  for(const width of [1280,390]){
   const context=await browser.newContext({viewport:{width,height:950}});
   await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
   await context.routeWebSocket('**/*',s=>new URL(s.url()).host===new URL(base).host?s.connectToServer():s.close());
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   const open=async(entry,operator=false)=>{await page.goto(base+'/tests/support-preview.html?role='+(operator?'operator':'user')+'&entry='+encodeURIComponent(entry));};
   const fill=async()=>{await page.getByLabel('문의 제목',{exact:true}).fill('3D 사진 표시 문의');await page.getByLabel('문의 내용',{exact:true}).fill('3D를 누르면 사진이 늦게 보입니다.');};
   const state=()=>page.evaluate(()=>window.fixture.state());
   const noOverflow=async()=>assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
   await open('/support/new?from=/jars/112&jarId=112&invite=secret');await fill();
   assert.equal(await page.getByLabel('문의 유형',{exact:true}).locator('option').count(),9);
   await page.getByText('문제가 발생한 화면 정보 함께 보내기').uncheck();
   await page.getByRole('button',{name:'문의 접수하기',exact:true}).evaluate(button=>{button.form.requestSubmit();button.form.requestSubmit();});
   await page.getByRole('heading',{name:'3D 사진 표시 문의',exact:true}).waitFor();
   let s=await state();assert.equal(s.creates,1);assert.equal(s.tickets[0].jarId,undefined);assert.equal(s.attachments.length,0);
   await page.getByLabel('추가 문의 내용').fill('추가 설명입니다.');await page.getByRole('button',{name:'내용 보내기',exact:true}).click();
   await page.getByText('추가 설명입니다.',{exact:true}).waitFor();
   await page.getByRole('button',{name:'해결됐어요',exact:true}).click();await page.getByText('해결된 문의예요.',{exact:false}).waitFor();
   await page.getByRole('button',{name:'아직 문제가 있어요 · 다시 문의',exact:true}).click();await page.getByLabel('추가 문의 내용').waitFor();
   await noOverflow();passed.push({width,scenario:'general-without-photo-duplicate-followup-resolve-reopen'});

   await open('/support/new');await fill();await page.getByLabel('화면 자료 선택').setInputFiles({name:'screen.png',mimeType:'image/png',buffer:png});
   await page.getByAltText('선택한 화면 자료 미리보기').waitFor();await page.getByRole('button',{name:'선택 취소',exact:true}).click();
   assert.equal(await page.getByAltText('선택한 화면 자료 미리보기').count(),0);
   await page.getByLabel('화면 자료 선택').setInputFiles({name:'screen.png',mimeType:'image/png',buffer:png});await page.getByAltText('선택한 화면 자료 미리보기').waitFor();
   await page.getByText('선택한 화면 자료를 문의 확인을 위해 운영자에게 공유하는 데 동의해요.').check();
   await page.evaluate(()=>window.fixture.failUpload=true);await page.getByRole('button',{name:'문의 접수하기',exact:true}).click();await page.getByRole('alert').filter({hasText:'일부 첨부'}).waitFor();
   assert.equal((await state()).tickets.length,1);await page.getByRole('button',{name:'남은 첨부 다시 시도',exact:true}).click();
   await page.getByRole('heading',{name:'3D 사진 표시 문의',exact:true}).waitFor();s=await state();assert.equal(s.creates,1);assert.equal(s.attachments.length,1);
   await noOverflow();passed.push({width,scenario:'optional-preview-remove-partial-failure-retry-same-ticket'});

   await open('/support/login-help');await page.getByLabel('문의 제목',{exact:true}).waitFor();
   assert.equal(await page.evaluate(()=>window.fixture.requests.filter(r=>r.url.endsWith('/session')&&r.method==='post').length),0);
   await fill();await page.getByRole('button',{name:'로그인 도움 문의 접수',exact:true}).click();await page.getByRole('heading',{name:'3D 사진 표시 문의',exact:true}).waitFor();
   s=await state();assert.equal(s.guestActive,true);assert.equal(s.tickets[0].category,'LOGIN_ACCOUNT');await noOverflow();passed.push({width,scenario:'guest-cookie-on-demand-and-thread'});

   await open('/help');await page.getByLabel('도움말 검색').fill('사진');await page.getByText('사진은 어떻게 올리나요?',{exact:true}).waitFor();
   assert.equal(await page.getByText('로그인이 안 돼요',{exact:true}).count(),0);await page.getByLabel('도움말 검색').fill('존재하지않는질문');await page.getByText('검색 결과가 없어요.',{exact:false}).waitFor();await noOverflow();passed.push({width,scenario:'faq-search-empty'});

   await open('/support/new');await fill();await page.evaluate(()=>window.fixture.deferCreate=true);await page.getByRole('button',{name:'문의 접수하기',exact:true}).click();
   await page.waitForFunction(()=>window.fixture.pending.length===1);await page.getByRole('link',{name:'내 문의',exact:true}).first().click();
   await page.getByRole('heading',{name:'내 문의',exact:true}).waitFor();
   await page.evaluate(()=>window.fixture.pending.shift()());await page.waitForTimeout(100);assert.equal(await page.getByRole('heading',{name:'3D 사진 표시 문의',exact:true}).count(),0);passed.push({width,scenario:'late-submit-cannot-navigate-after-leaving'});

   await open('/support/new');await fill();await page.evaluate(()=>window.fixture.deferCreate=true);await page.getByRole('button',{name:'문의 접수하기',exact:true}).click();
   await page.waitForFunction(()=>window.fixture.pending.length===1);await page.evaluate(()=>window.fixture.switchUser());
   await page.waitForFunction(()=>document.querySelector('input[aria-label="문의 제목"]').value==='');
   await page.evaluate(()=>window.fixture.pending.shift()());await page.waitForTimeout(100);
   assert.equal(await page.getByLabel('문의 제목',{exact:true}).inputValue(),'');assert.equal(await page.getByRole('heading',{name:'3D 사진 표시 문의',exact:true}).count(),0);
   passed.push({width,scenario:'late-submit-cannot-affect-next-account'});

   await open('/support/new',true);await fill();await page.getByRole('button',{name:'문의 접수하기',exact:true}).click();await page.getByRole('heading',{name:'3D 사진 표시 문의',exact:true}).waitFor();
   await page.getByRole('link',{name:'운영 문의함',exact:true}).first().click();await page.getByRole('link',{name:/3D 사진 표시 문의/}).click();
   await page.getByLabel('운영자 답변',{exact:true}).fill('어느 단계에서 멈추나요?');await page.getByText('문의자에게 추가 정보가 필요해요').check();await page.getByRole('button',{name:'답변 보내기',exact:true}).click();
   await page.getByText('어느 단계에서 멈추나요?',{exact:true}).waitFor();assert.equal((await state()).tickets[0].status,'WAITING_USER');await noOverflow();passed.push({width,scenario:'operator-requests-followup'});
   assert.deepEqual(errors,[]);await context.close();
  }
  console.log(JSON.stringify({passed:passed.length,scenarios:passed},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
