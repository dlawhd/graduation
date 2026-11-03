/** 실제 App에서 도움말·문의의 공통 헤더·배경·좁은 화면·키보드 첨부와 동의 상태를 확인한다. 모든 API는 로컬 응답으로 대체한다. */
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:3002';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});const passed=[];
 const output=process.env.SUPPORT_SCREENSHOT_DIR;
 if(output)await fs.mkdir(output,{recursive:true});
 try {
  for(const width of [1280,390,320]) {
   const context=await browser.newContext({viewport:{width,height:1000}}),unexpected=[],errors=[];
   await context.route('**/*',route=>{
    const url=new URL(route.request().url());
    if(url.pathname.startsWith('/api/v1/')) {
     const headers={'Access-Control-Allow-Origin':base,'Access-Control-Allow-Credentials':'true'};
     if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers:{...headers,'Access-Control-Allow-Headers':'content-type,x-xsrf-token'}});
     if(url.pathname==='/api/v1/me')return route.fulfill({status:401,headers,json:{error:{code:'UNAUTHORIZED'}}});
     if(url.pathname==='/api/v1/csrf')return route.fulfill({headers,json:{data:{token:'local-test',headerName:'X-XSRF-TOKEN'}}});
     if(url.pathname==='/api/v1/auth/refresh')return route.fulfill({status:401,headers,json:{error:{code:'UNAUTHORIZED'}}});
     if(url.pathname==='/api/v1/public/support/session')return route.fulfill({headers,json:{data:{active:false}}});
     if(url.pathname==='/api/v1/public/support/faq')return route.fulfill({headers,json:{data:[{id:'login',category:'LOGIN_ACCOUNT',question:'로그인이 안 돼요',answer:'아이디와 비밀번호를 확인하고, 문제가 계속되면 로그인 도움 문의를 이용해 주세요.'}]}});
     unexpected.push(url.pathname);return route.abort();
    }
    return url.origin===base?route.continue():route.abort();
   });
   await context.routeWebSocket('**/*',s=>new URL(s.url()).host===new URL(base).host?s.connectToServer():s.close());
   const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
   await page.goto(base+'/support/login-help');
   await page.getByRole('heading',{name:'어떤 어려움이 있었나요?',exact:true}).waitFor();
   await page.getByLabel('문의 제목',{exact:true}).waitFor();await page.evaluate(()=>document.fonts.ready);
   const header=page.locator('header').first(),submit=page.getByRole('button',{name:'문의 접수하기',exact:true});
   const headerTheme=()=>header.evaluate(el=>{
    const background=getComputedStyle(el).backgroundColor,canvas=document.createElement('canvas');canvas.width=canvas.height=1;
    // Chrome은 흰색도 oklab/rgb 등으로 반환할 수 있으므로 실제 sRGB 값으로 비교한다.
    const paint=canvas.getContext('2d');paint.fillStyle=background;paint.fillRect(0,0,1,1);
    return {background,backgroundRgb:Array.from(paint.getImageData(0,0,1,1).data),brand:getComputedStyle(el.querySelector('a p')).color};
   });
   const originalHeader=await headerTheme();assert.equal(originalHeader.backgroundRgb.slice(0,3).every(value=>value>=250),true);
   const background=await page.locator('.support-letter-page').evaluate(el=>getComputedStyle(el).backgroundColor);
   assert.equal(await page.getByRole('combobox').count(),0);
   assert.equal(await submit.isDisabled(),true);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
   assert.equal(await page.locator('.support-letter-art').isVisible(),width>=640);
   await page.getByText('답변은 같은 브라우저에서 확인해 주세요.',{exact:true}).waitFor();
   if(output)await page.screenshot({path:path.join(output,`guest-${width}.png`),fullPage:true});

   await page.getByLabel('문의 제목',{exact:true}).fill('로그인 문제');
   await page.getByLabel('문의 내용',{exact:true}).fill('로그인 버튼을 누른 뒤 진행되지 않아요.');
   assert.equal(await submit.isEnabled(),true);
   // 숨김 파일 입력도 키보드로 선택창을 열 수 있고, 파일을 고른 뒤에는 공유 동의를 받아야 한다.
   const input=page.getByLabel('화면 자료 선택');await input.focus();
   assert.equal(await input.evaluate(el=>el===document.activeElement),true);
   const chooser=page.waitForEvent('filechooser');await page.keyboard.press('Space');
   await (await chooser).setFiles({name:'screen.png',mimeType:'image/png',buffer:png});
   await page.getByAltText('선택한 화면 자료 미리보기').waitFor();
   const consent=page.getByText('선택한 화면 자료를 문의 확인을 위해 운영자에게 공유하는 데 동의해요.');
   assert.equal(await submit.isDisabled(),true);await consent.check();assert.equal(await submit.isEnabled(),true);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
   if(output){await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:path.join(output,`guest-with-attachment-${width}.png`),fullPage:true});}
   await page.getByRole('button',{name:'선택 취소',exact:true}).click();
   assert.equal(await page.getByAltText('선택한 화면 자료 미리보기').count(),0);
   assert.equal(await submit.isEnabled(),true);

   // 문의용 CSS가 로딩된 상태에서도 도움말과 목록의 헤더·배경은 작성 화면과 같아야 한다.
   await page.getByRole('link',{name:'← 도움말',exact:true}).click();
   await page.getByRole('heading',{name:'도움말·문의',exact:true}).waitFor();
   assert.deepEqual(await headerTheme(),originalHeader);
   assert.equal(await page.locator('.support-letter-page').evaluate(el=>getComputedStyle(el).backgroundColor),background);
   assert.equal(await page.locator('.support-letter-art').count(),0);
   await page.getByText('로그인이 안 돼요',{exact:true}).click();
   await page.getByText('아이디와 비밀번호를 확인하고, 문제가 계속되면 로그인 도움 문의를 이용해 주세요.',{exact:true}).waitFor();
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
   if(output){await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:path.join(output,`help-${width}.png`),fullPage:true});}
   await page.getByRole('link',{name:'내 문의',exact:true}).click();
   await page.getByRole('heading',{name:'내 문의',exact:true}).waitFor();
   await page.getByText('로그인 후 문의를 확인할 수 있어요.',{exact:true}).waitFor();
   assert.deepEqual(await headerTheme(),originalHeader);
   assert.equal(await page.locator('.support-letter-page').evaluate(el=>getComputedStyle(el).backgroundColor),background);
   await page.getByRole('link',{name:'도움말',exact:true}).last().click();
   await page.getByRole('heading',{name:'도움말·문의',exact:true}).waitFor();
   await page.getByRole('link',{name:'로그인 문제 도움',exact:true}).click();
   await page.getByLabel('문의 제목',{exact:true}).waitFor();
   assert.deepEqual(await headerTheme(),originalHeader);
   assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);
   passed.push({width,scenario:'consistent-help-inquiries-header-background-keyboard-upload-consent-responsive'});
   await context.close();
  }
  console.log(JSON.stringify({passed:passed.length,scenarios:passed},null,2));
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
