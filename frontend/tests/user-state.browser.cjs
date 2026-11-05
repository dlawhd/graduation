/** 실제 React·STOMP 클라이언트를 사용하고, 네트워크와 데이터는 로컬 시험용으로만 대체한다. */
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:3002';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64');
async function setup(browser,width){
 const context=await browser.newContext({viewport:{width,height:950}}),sockets=new Set();
 await context.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
 await context.routeWebSocket('**/*',socket=>{
  const url=new URL(socket.url());
  // Vite의 코드 갱신 연결은 가짜 STOMP 브로커와 구분한다.
  if(url.host===new URL(base).host&&url.pathname!=='/ws'){socket.connectToServer();return;}
  if(url.pathname!=='/ws'){socket.close();return;}
  const registration={socket,subscriptions:new Map()};sockets.add(registration);
  socket.onClose(()=>sockets.delete(registration));
  socket.onMessage(raw=>{
   for(const frame of String(raw).split('\0')){
    const command=frame.trimStart().split('\n')[0],headers={};
    for(const line of frame.split('\n').slice(1)){if(!line)break;const i=line.indexOf(':');headers[line.slice(0,i)]=line.slice(i+1);}
    if(command==='CONNECT'||command==='STOMP')socket.send('CONNECTED\nversion:1.2\nheart-beat:0,0\n\n\0');
    if(command==='SUBSCRIBE')registration.subscriptions.set(headers.id,headers.destination);
    if(command==='UNSUBSCRIBE')registration.subscriptions.delete(headers.id);
    if(command==='DISCONNECT')socket.close();
   }
  });
 });
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const count=destination=>[...sockets].reduce((n,s)=>n+[...s.subscriptions.values()].filter(d=>d===destination).length,0);
 const ready=async(id=1)=>{const deadline=Date.now()+15000;while(!count(`/topic/users/${id}/state`)){if(Date.now()>deadline)throw new Error('personal subscription missing: '+errors.join(';'));await page.waitForTimeout(30);}};
 const emit=(event,id=1)=>{for(const r of sockets)for(const [sub,destination]of r.subscriptions)if(destination===`/topic/users/${id}/state`)
  r.socket.send(`MESSAGE\nsubscription:${sub}\ndestination:${destination}\nmessage-id:${Date.now()}\ncontent-type:application/json\n\n${JSON.stringify(event)}\0`);};
 return {context,page,errors,ready,emit,count,sockets};
}
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true}),passed=[];
 try{for(const width of [1280,390]){
  const t=await setup(browser,width),{page,emit,ready}=t;
  await page.goto(base+'/tests/user-state-preview.html');
  try {await page.getByRole('button',{name:'내가 넣은 쪽지',exact:true}).waitFor({timeout:10000});}
  catch(e){console.log(await page.locator('body').innerText(),t.errors,await page.evaluate(()=>window.fixture?.requests));throw e;}await ready();
  assert.equal(await page.evaluate(()=>window.fixture.requests.some(r=>/\/notes(?:\?|$)/.test(r.url))),false,JSON.stringify(await page.evaluate(()=>window.fixture.requests)));
  await page.getByRole('button',{name:'내가 넣은 쪽지',exact:true}).click();
  const modal=page.getByRole('dialog',{name:'내가 넣은 쪽지'});
  await modal.getByText('내 쪽지 11개',{exact:true}).waitFor();
  await modal.getByRole('button',{name:/나의 추억 1\s/}).click();
  await modal.getByText('내가 남긴 본문 1',{exact:true}).waitFor();
  assert.equal(await modal.getByRole('img').count(),1);
  require('node:fs').mkdirSync('../build/realtime-own-notes',{recursive:true});
  await page.screenshot({path:`../build/realtime-own-notes/own-notes-${width}.png`});
  assert.equal(await modal.getByText('댓글',{exact:true}).count(),0);
  await modal.getByRole('button',{name:'← 내 쪽지 목록',exact:true}).click();
  await modal.getByRole('button',{name:'다음',exact:true}).click();await modal.getByText('내 쪽지 11개',{exact:true}).waitFor();
  await modal.getByRole('button',{name:/나의 추억 11/}).waitFor();
  await modal.getByLabel('내 쪽지 검색').fill('나의 추억 5');await modal.getByRole('button',{name:'검색',exact:true}).click();
  await modal.getByText('내 쪽지 1개',{exact:true}).waitFor();
  await modal.getByLabel('내 쪽지 검색').fill('없는 내용');await modal.getByRole('button',{name:'검색',exact:true}).click();
  await modal.getByText('검색 결과가 없어요.',{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
  await page.keyboard.press('Escape');await modal.waitFor({state:'hidden'});
  assert.equal(await page.getByRole('button',{name:'내가 넣은 쪽지',exact:true}).evaluate(b=>b===document.activeElement),true);
  passed.push({width,test:'own-notes-list-detail-attachment-search-page-empty-focus'});

  await page.evaluate(()=>window.fixture.failMine=true);await page.getByRole('button',{name:'내가 넣은 쪽지',exact:true}).click();
  await modal.getByRole('alert').filter({hasText:'내 목록 시험 오류'}).waitFor();await modal.getByRole('button',{name:'다시 확인',exact:true}).click();
  await modal.getByText('내 쪽지 11개',{exact:true}).waitFor();
  await page.evaluate(()=>window.fixture.deferDetail=true);await modal.getByRole('button',{name:/나의 추억 1\s/}).click();
  await page.waitForFunction(()=>window.fixture.pending.length===1);await modal.getByRole('button',{name:'← 내 쪽지 목록',exact:true}).click();
  await page.evaluate(()=>window.fixture.pending.shift()());await page.waitForTimeout(80);
  assert.equal(await modal.getByText('내가 남긴 본문 1',{exact:true}).count(),0);await page.keyboard.press('Escape');
  passed.push({width,test:'own-notes-error-retry-stale-detail'});

  await page.evaluate(()=>window.fixture.jar.name='실시간 변경된 이름');emit({type:'JAR_CHANGED',jarId:7});
  await page.getByText('실시간 변경된 이름',{exact:true}).first().waitFor();
  await page.getByRole('button',{name:'저금통 설정 수정하기',exact:true}).click();
  const edit=page.getByRole('dialog',{name:'저금통 설정 수정',exact:true});
  await edit.getByLabel('저금통 이름',{exact:true}).fill('작성 중인 설정');
  await page.evaluate(()=>window.fixture.jar.description='다른 관리자의 설명 변경');emit({type:'JAR_CHANGED',jarId:7});await page.waitForTimeout(350);
  assert.equal(await edit.getByLabel('저금통 이름',{exact:true}).inputValue(),'작성 중인 설정');
  await edit.getByRole('button',{name:'닫기',exact:true}).click();
  await page.evaluate(()=>window.fixture.jar.name='재접속 뒤 최신 이름');
  for(const r of [...t.sockets]){t.sockets.delete(r);r.socket.close({code:1001,reason:'local reconnect test'});}
  try{await page.getByText('재접속 뒤 최신 이름',{exact:true}).first().waitFor({timeout:15000});}
  catch(e){console.log('reconnect',t.sockets.size,[...t.sockets].map(r=>[...r.subscriptions.values()]),await page.evaluate(()=>({connected:window.fixture.connected,requests:window.fixture.requests})),t.errors);throw e;}await ready();
  assert.equal(t.sockets.size,1);
  await page.evaluate(()=>window.fixture.jar.name='실시간 변경된 이름');await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await page.getByText('실시간 변경된 이름',{exact:true}).first().waitFor();
  // 300개 변경이 한 화면에 몰려도 구간별 요청을 합쳐 조회한다.
  const before=await page.evaluate(()=>window.fixture.requests.filter(r=>r.url==='/api/v1/jars/7').length);
  for(let i=0;i<300;i++)emit({type:'JAR_CHANGED',jarId:7});await page.waitForTimeout(650);
  const after=await page.evaluate(()=>window.fixture.requests.filter(r=>r.url==='/api/v1/jars/7').length);
  assert.ok(after-before>=1&&after-before<=3,`burst detail reads: ${after-before}`);
  const inviteBefore=await page.evaluate(()=>window.fixture.requests.filter(r=>r.url.endsWith('/invites')).length);
  emit({type:'INVITES_CHANGED',jarId:7});await page.waitForFunction(n=>window.fixture.requests.filter(r=>r.url.endsWith('/invites')).length>n,inviteBefore);
  passed.push({width,test:'jar-settings-invites-reconnect-focus-and-300-events-coalesced'});

  await page.getByRole('link',{name:'내 저금통 시험',exact:true}).click();await ready();
  await page.getByText('실시간 변경된 이름',{exact:true}).first().waitFor();
  await page.evaluate(()=>window.fixture.jar.name='목록도 갱신');emit({type:'JAR_LIST_CHANGED',jarId:7});await page.getByText('목록도 갱신',{exact:true}).first().waitFor();
  await page.getByRole('link',{name:'상세 시험',exact:true}).click();await page.getByRole('button',{name:'내가 넣은 쪽지',exact:true}).waitFor();await ready();
  await page.evaluate(()=>window.fixture.removed=true);emit({type:'JAR_ACCESS_REVOKED',jarId:7});
  await page.getByText('저금통 참여 상태가 변경됐어요.',{exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'내가 넣은 쪽지',exact:true}).count(),0);
  passed.push({width,test:'jar-list-update-and-revocation-navigation'});
  assert.deepEqual(t.errors,[]);await t.context.close();

  const s=await setup(browser,width),p=s.page;
  await p.goto(base+'/tests/support-preview.html?realtime=1&entry='+encodeURIComponent('/support/new'));
  await p.getByLabel('문의 제목',{exact:true}).fill('실시간 문의');await p.getByLabel('문의 내용',{exact:true}).fill('추가 대화 시험');
  await p.getByRole('button',{name:'문의 접수하기',exact:true}).click();await p.getByRole('heading',{name:'실시간 문의',exact:true}).waitFor();await s.ready();
  await p.getByLabel('추가 문의 내용').fill('저장 전 작성 중인 글');
  await p.getByLabel('화면 자료 선택').setInputFiles({name:'screen.png',mimeType:'image/png',buffer:png});await p.getByAltText('선택한 화면 자료 미리보기').waitFor();
  await p.evaluate(()=>{const f=window.fixture.state();f.tickets[0].status='WAITING_USER';f.messages.push({messageId:1,inquiryId:1,role:'OPERATOR',content:'운영자가 보낸 새 답변'});});
  s.emit({type:'SUPPORT_CHANGED',inquiryId:1});await p.getByText('운영자가 보낸 새 답변',{exact:true}).waitFor();
  assert.equal(await p.getByLabel('추가 문의 내용').inputValue(),'저장 전 작성 중인 글');assert.equal(await p.getByAltText('선택한 화면 자료 미리보기').count(),1);
  await p.evaluate(()=>window.fixture.state().tickets[0].status='RESOLVED');s.emit({type:'SUPPORT_CHANGED',inquiryId:1});await p.getByText('해결된 문의예요.',{exact:false}).waitFor();
  await p.getByRole('button',{name:'아직 문제가 있어요 · 다시 문의',exact:true}).click();await p.getByLabel('추가 문의 내용').waitFor();
  assert.equal(await p.getByLabel('추가 문의 내용').inputValue(),'저장 전 작성 중인 글');
  assert.equal(await p.getByAltText('선택한 화면 자료 미리보기').count(),1);
  passed.push({width,test:'support-live-reply-resolve-reopen-preserves-draft-and-file'});
  await p.getByRole('link',{name:'← 문의 목록',exact:true}).click();await s.ready();
  await p.evaluate(()=>window.fixture.state().tickets[0].status='RESOLVED');s.emit({type:'SUPPORT_CHANGED',inquiryId:1});await p.getByText(/해결 완료/).waitFor();
  await p.getByRole('link',{name:'운영 문의함',exact:true}).first().click();
  // 운영 권한이 없는 계정에는 목록이나 실시간 구독을 열지 않는다.
  await p.getByText('서비스 운영자만 이용할 수 있습니다.',{exact:false}).waitFor();
  assert.equal(s.count('/topic/users/1/state'),0);
  assert.deepEqual(s.errors,[]);await s.context.close();
  const operator=await setup(browser,width),o=operator.page;
  await o.goto(base+'/tests/support-preview.html?role=operator&realtime=1&entry='+encodeURIComponent('/support/new'));
  await o.getByLabel('문의 제목',{exact:true}).fill('운영 상태 문의');await o.getByLabel('문의 내용',{exact:true}).fill('운영 문의함 갱신');
  await o.getByRole('button',{name:'문의 접수하기',exact:true}).click();await o.getByRole('heading',{name:'운영 상태 문의',exact:true}).waitFor();
  await o.getByRole('link',{name:'운영 문의함',exact:true}).first().click();await operator.ready(9);
  await o.evaluate(()=>window.fixture.state().tickets[0].status='RESOLVED');operator.emit({type:'SUPPORT_CHANGED',inquiryId:1},9);
  await o.getByRole('link',{name:/운영 상태 문의/}).getByText(/해결 완료/).waitFor();
  await o.getByRole('link',{name:/운영 상태 문의/}).click();await operator.ready(9);
  await o.evaluate(()=>window.fixture.state().tickets[0].status='IN_PROGRESS');operator.emit({type:'SUPPORT_CHANGED',inquiryId:1},9);
  await o.getByLabel('운영자 답변',{exact:true}).waitFor();
  await o.goto(base+'/tests/support-preview.html?realtime=1&entry='+encodeURIComponent('/support/login-help'));
  await o.getByLabel('문의 제목',{exact:true}).fill('비로그인 문의');await o.getByLabel('문의 내용',{exact:true}).fill('로그인 도움');
  await o.getByRole('button',{name:'문의 접수하기',exact:true}).click();await o.getByRole('heading',{name:'비로그인 문의',exact:true}).waitFor();
  assert.equal(operator.count('/topic/users/1/state'),0);assert.equal(operator.count('/topic/users/9/state'),0);
  passed.push({width,test:'operator-live-list-detail-and-guest-has-no-subscription'});
  assert.deepEqual(operator.errors,[]);await operator.context.close();
 }}finally{await browser.close();}
 console.log(JSON.stringify({passed:passed.length,scenarios:passed},null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
