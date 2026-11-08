/** 실제 두 탭의 Web Locks·Axios와 화면 이탈 중의 멤버/초대 Hook을 로컬 대역 응답만으로 검증한다. */
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:3004';
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const context=await browser.newContext();await context.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
  const pages=await Promise.all([context.newPage(),context.newPage()]);
  for(const page of pages){
   await page.goto(base+'/tests/request-races.html?mode=auth');
   await page.waitForFunction(()=>window.race);
   await page.evaluate(()=>{
    window.expiryNotices=0;window.addEventListener('memoryjar:session-expired',()=>window.expiryNotices++);
    window.race.apiClient.defaults.adapter=async config=>{
     const success=data=>({config,status:200,statusText:'OK',headers:{},data:{data}});
     const invalid=()=>Promise.reject({config,response:{status:401}});
     if(config.url==='/api/v1/csrf')return success({token:'fixture'});
     if(config.url==='/fixture-protected'&&!config._retry){window.initialSent=true;await new Promise(resolve=>window.releaseInitial=resolve);return invalid();}
     if(config.url==='/fixture-held'){window.heldSent=true;await new Promise(resolve=>window.releaseHeld=resolve);return invalid();}
     if(config.url==='/api/v1/me')return localStorage.getItem('fixture-session')==='valid'?success({userId:1}):invalid();
     if(config.url==='/api/v1/auth/refresh'){
      localStorage.setItem('fixture-refresh-count',String(Number(localStorage.getItem('fixture-refresh-count')||0)+1));
      await new Promise(r=>setTimeout(r,75));localStorage.setItem('fixture-session','valid');return success({ok:true});
     }
     return success({ok:true});
    };
    window.race.request('/fixture-protected').then(()=>window.completed=true,e=>window.failed=e.code||'error');
   });
  }
  await Promise.all(pages.map(p=>p.waitForFunction(()=>window.initialSent)));
  await Promise.all(pages.map(p=>p.evaluate(()=>window.releaseInitial())));
  await Promise.all(pages.map(p=>p.waitForFunction(()=>window.completed||window.failed)));
  for(const p of pages){assert.equal(await p.evaluate(()=>window.completed),true);assert.equal(await p.evaluate(()=>window.expiryNotices),0);}
  assert.equal(await pages[0].evaluate(()=>localStorage.getItem('fixture-refresh-count')),'1');
  console.log('PASS actual two tabs: one refresh, both requests recovered, no false expiry');
  await pages[1].evaluate(()=>{window.race.request('/fixture-held').catch(e=>window.heldResult=e.code)});
  await pages[1].waitForFunction(()=>window.heldSent);
  await pages[0].evaluate(()=>window.race.beginAuthChange());
  await pages[1].waitForFunction(()=>window.expiryNotices===1);
  await pages[1].evaluate(()=>window.releaseHeld());
  await pages[1].waitForFunction(()=>window.heldResult==='ERR_CANCELED');
  assert.equal(await pages[0].evaluate(()=>localStorage.getItem('fixture-refresh-count')),'1');
  console.log('PASS account change in another tab: old request canceled without refresh or replay');
  await context.close();
  for(const width of [390,1280]){
   const ctx=await browser.newContext({viewport:{width,height:900}});await ctx.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
   const p=await ctx.newPage();const dialogs=[];p.on('dialog',async d=>{dialogs.push(d.message());await d.accept()});
   await p.goto(base+'/tests/request-races.html?mode=mutations');await p.waitForFunction(()=>window.race.leave);
   const pending=()=>p.evaluate(()=>window.race.pending());const respond=r=>p.evaluate(i=>window.race.respond(i,{}),r.index);
   await p.evaluate(()=>{void window.race.leave();void window.race.leave()});
   await p.waitForFunction(()=>window.race.pending().some(r=>r.url.endsWith('/leave')));
   const oldLeave=(await pending()).filter(r=>r.url.endsWith('/leave'));assert.equal(oldLeave.length,1);
   await p.evaluate(()=>window.race.switchJar('2'));await p.waitForFunction(()=>JSON.parse(document.querySelector('#snapshot').textContent).id==='2');
   await respond(oldLeave[0]);await p.waitForTimeout(100);assert.deepEqual(await p.evaluate(()=>window.race.navigations||[]),[]);
   await p.evaluate(()=>window.race.setRole('OWNER'));await p.waitForTimeout(50);
   await p.evaluate(()=>{void window.race.createInvite();void window.race.createInvite()});
   await p.waitForFunction(()=>window.race.pending().some(r=>r.url==='/api/v1/jars/2/invites'&&r.method==='post'));
   const oldCreate=(await pending()).filter(r=>r.url==='/api/v1/jars/2/invites'&&r.method==='post');assert.equal(oldCreate.length,1);
   await p.evaluate(()=>window.race.switchJar('3'));await p.waitForFunction(()=>JSON.parse(document.querySelector('#snapshot').textContent).id==='3');
   await respond(oldCreate[0]);await p.waitForTimeout(100);
   assert.equal(dialogs.some(s=>s.includes('만들어졌어요')||s.includes('나갔어요')),false);
   console.log('PASS width '+width+': stale leave/create response suppressed; duplicate writes blocked');await ctx.close();
  }
  // 생성 응답이 끊겨도 최종 확인 화면의 재제출은 같은 요청 번호를 유지한다.
  const noteContext=await browser.newContext({reducedMotion:'reduce'});
  await noteContext.addInitScript(()=>window.__MEMORYJAR_AUDIT_TEST__=true);
  const submissions=[];
  await noteContext.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());
   if(url.pathname.startsWith('/api/')){
    if(url.pathname.endsWith('/csrf'))return route.fulfill({contentType:'application/json',body:JSON.stringify({data:{token:'fixture'}})});
    if(req.method()==='POST'&&url.pathname==='/api/v1/jars/10/notes'){
     submissions.push(req.postDataJSON());
     return route.fulfill({status:submissions.length===1?503:201,contentType:'application/json',body:JSON.stringify(submissions.length===1?{error:{message:'시험 응답 유실'}}:{data:{noteId:20,jarId:10}})});
    }
    return route.fulfill({contentType:'application/json',body:JSON.stringify({data:{items:[],page:0,size:6,totalPages:0,totalElements:0}})});
   }
   return url.origin===base?route.continue():route.abort();
  });
  const n=await noteContext.newPage();await n.goto(base+'/tests/write-safety.html?view=composer');
  await n.getByPlaceholder('예: 우리 첫 여행').fill('재시도 시험');
  await n.getByPlaceholder('남기고 싶은 추억을 자유롭게 적어 주세요.').fill('같은 작성 내용');
  await n.getByRole('button',{name:'미리보기 보기',exact:true}).click();
  await n.getByRole('button',{name:'제출 확인으로',exact:true}).click();
  await n.getByRole('button',{name:'저금통에 넣기',exact:true}).click();
  await n.getByText('시험 응답 유실',{exact:true}).waitFor();
  await n.getByRole('button',{name:'저금통에 넣기',exact:true}).click();
  await n.getByText('쪽지를 저금통에 넣었어요.',{exact:true}).waitFor();
  assert.equal(submissions.length,2);assert.match(submissions[0].requestId,/^[a-f0-9-]{36}$/);
  assert.equal(submissions[0].requestId,submissions[1].requestId);
  console.log('PASS real note composer: failed response retry retains submission id');await noteContext.close();
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
