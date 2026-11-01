/** 고정 Git 소스 두 개를 로컬 주소로만 빌드하고, loopback 프록시로 제공한다. 운영 배포 기능은 없다. */
import assert from "node:assert/strict";
import {createServer,request as httpRequest} from "node:http";
import {connect} from "node:net";
import {createReadStream,existsSync,mkdirSync,readFileSync,writeFileSync} from "node:fs";
import {resolve,join,sep,extname} from "node:path";
import {fileURLToPath,pathToFileURL} from "node:url";
import {createHash,randomUUID} from "node:crypto";
import {execFileSync} from "node:child_process";
const toolRoot=fileURLToPath(new URL(".",import.meta.url)),projectRoot=resolve(toolRoot,"../..");
export const BASELINES={c5f58c4:"c5f58c4f7440122acba040aa5ab2042284e53987",dd6e50b:"dd6e50b31ee9405f41a255152510367aa9d27cca","8a5f7cc":"8a5f7cc6e689e23a1d495c31b2f3c3f4a388aade"};
/** 비교 대상을 허용한 전체 커밋 해시로 고정해 임의의 소스로 바뀌지 않게 한다. */
export function commitsFor(baseline="dd6e50b"){assert.ok(Object.hasOwn(BASELINES,baseline),"Unsupported baseline");return {before:BASELINES[baseline],after:"8a5f7cc6e689e23a1d495c31b2f3c3f4a388aade"};}
export const COMMITS=commitsFor();
function manifestCommits(root){const manifest=JSON.parse(readFileSync(join(root,"run-public.json"),"utf8"));const commits=commitsFor(manifest.baseline);assert.deepEqual(manifest.commits,commits);return commits;}
const ORIGINS={before:"http://127.0.0.1:18900",after:"http://localhost:18901"};
const hash=data=>createHash("sha256").update(data).digest("hex");
const WORKING_FILES=["frontend/src/features/jarDesign/body3DMesh.mjs","frontend/src/features/jarDesign/body3DBase.mjs"];
/** 현재 커밋의 두 계산 파일만 시험 복사본에 덮는다. 운영/백엔드/환경 설정은 복사하지 않는다. */
export function overlayWorkingFrontend(root){
  const manifest=JSON.parse(readFileSync(join(root,"run-public.json"),"utf8"));
  assert.ok(["dd6e50b","8a5f7cc"].includes(manifest.baseline));assert.equal(manifest.workingFrontend,true);
  const commits=manifestCommits(root);
  const git=(...args)=>execFileSync("git",args,{cwd:projectRoot,encoding:"utf8"});
  assert.equal(git("rev-parse","HEAD").trim(),COMMITS.after,"Working tree baseline changed");
  const changes=git("diff","--name-only","HEAD","--","frontend/src").trim().split(/\r?\n/).filter(Boolean);
  assert.ok(changes.every(file=>WORKING_FILES.includes(file)),"Unexpected application changes");
  assert.equal(git("ls-files","--others","--exclude-standard","--","frontend/src").trim(),"","Untracked application sources require review");
  const files={};
  for(const file of WORKING_FILES){
    const original=git("show",`${COMMITS.after}:${file}`).replaceAll("\r\n","\n");
    const beforeOriginal=git("show",`${commits.before}:${file}`).replaceAll("\r\n","\n");
    assert.equal(readFileSync(join(root,"before",file),"utf8").replaceAll("\r\n","\n"),beforeOriginal,"Pinned archive changed");
    assert.equal(readFileSync(join(root,"after",file),"utf8").replaceAll("\r\n","\n"),original,"Pinned archive changed");
    const bytes=readFileSync(join(projectRoot,file));writeFileSync(join(root,"after",file),bytes);
    files[file]={beforeNormalizedSha256:hash(beforeOriginal),pinnedNormalizedSha256:hash(original),workingSha256:hash(bytes)};
  }
  manifest.workingFrontendFiles=files;
  writeFileSync(join(root,"run-public.json"),JSON.stringify(manifest,null,2));
}
/** 작업 폴더 바깥 경로나 다른 실행의 폴더를 잘못 사용하는 것을 막는다. */
export function validateRoot(input){const root=resolve(input);assert.ok(root.startsWith(resolve(projectRoot,"build/local-comparison")+sep));assert.match(root.split(/[\\/]/).at(-1),/^local-compare-[a-f0-9]{12}$/);return root;}
/** 계산·그리기는 유지하고 로컬 전용 관찰 호출만 메모리 안의 빌드에 추가한다. */
export function instrument(source,variant,baseline="dd6e50b"){
  assert.ok(Object.hasOwn(COMMITS,variant));
  commitsFor(baseline);
  const anchor="stage.dataset.side=photoSurface.side;";assert.equal(source.split(anchor).length,2,"Draw anchor changed");
  // 평면 사진을 DOM에 겹친 c5만 별도 이미지 검사로 완료를 판정한다. 곡면 버전은 텍스처까지 기다린다.
  const ready=variant==="before"&&baseline==="c5f58c4"?"true":"borderReady && photoReady";
  if(ready!=="true")assert.match(source,/let borderReady=.*photoReady=/,"Texture readiness changed");
  let result=source.replace(anchor,`${anchor}\n        globalThis.__memoryJarComparison?.frame(stage,${ready},geometry.index?geometry.index.count/3:geometry.attributes.position.count/3);`);
  assert.equal(result.split("function fail(message) {").length,2,"Failure anchor changed");
  return result.replace("function fail(message) {","function fail(message) { globalThis.__memoryJarComparison?.fail();");
}
async function prepare(root){
  const commits=manifestCommits(root),manifest=JSON.parse(readFileSync(join(root,"run-public.json"),"utf8")),baseline=manifest.baseline;
  if(manifest.workingFrontend){
    assert.ok(["dd6e50b","8a5f7cc"].includes(baseline));assert.deepEqual(Object.keys(manifest.workingFrontendFiles).sort(),[...WORKING_FILES].sort());
    for(const file of WORKING_FILES)assert.equal(hash(readFileSync(join(root,"after",file))),manifest.workingFrontendFiles[file].workingSha256);
  }
  const {IRREGULAR_BODY_OUTLINE}=await import(pathToFileURL(join(projectRoot,"frontend/tests/fixtures/irregularBodyOutline.mjs")));
  const fixture={version:1,theme:"SAND",customBody:IRREGULAR_BODY_OUTLINE,photoFrame:{x:0,y:0,width:1,height:1,fit:"COVER"}};
  writeFileSync(join(root,"design.json"),JSON.stringify(fixture));
  writeFileSync(join(root,"account-private.json"),JSON.stringify({loginId:"localcompare",password:`Local7!${randomUUID().replaceAll("-","")}`}));
  const observer=readFileSync(join(toolRoot,"local-comparison-monitor.mjs"));writeFileSync(join(root,"monitor.mjs"),observer);
  const vite=await import(pathToFileURL(join(projectRoot,"frontend/node_modules/vite/dist/node/index.js")));
  const builds={};const envDir=join(root,"empty-env");mkdirSync(envDir);
  for(const variant of ["before","after"]){
    const sourceRoot=join(root,variant,"frontend"),component=join(sourceRoot,"src/features/jarDesign/components/CustomJarBody3D.jsx");
    let reads=0;
    await vite.build({root:sourceRoot,configFile:join(sourceRoot,"vite.config.js"),envDir,envPrefix:"LOCAL_COMPARISON_UNUSED_",mode:"production",
      define:{"import.meta.env.VITE_API_BASE_URL":JSON.stringify(""),"import.meta.env.VITE_WS_BASE_URL":JSON.stringify(ORIGINS[variant].replace("http:","ws:")+"/ws")},
      plugins:[{name:"isolated-comparison-observer",enforce:"pre",load(id){if(resolve(id.split("?")[0])===component){reads++;return instrument(readFileSync(component,"utf8"),variant,baseline);}},
        transformIndexHtml(html){return html.replace("<head>",`<head><meta name="comparison-variant" content="${variant}"><meta name="comparison-commit" content="${commits[variant]}"><meta name="comparison-working-tree" content="${Boolean(manifest.workingFrontend&&variant==="after")}"><script type="module" src="/__comparison/monitor.mjs"></script><style>[data-custom-body-viewer]{width:380px!important;height:380px!important;max-width:none!important}[aria-label="저금통 3D 회전 보기"],[data-view-stage]{width:380px!important;height:380px!important}</style>`);}}],
      build:{outDir:join(root,"dist",variant),emptyOutDir:false}});
    assert.equal(reads,1);builds[variant]={commit:commits[variant],componentSha256:hash(readFileSync(component))};
  }
  writeFileSync(join(root,"build-public.json"),JSON.stringify({scope:"LOCAL_HISTORICAL_RELEASE_COMPARISON",workingFrontendFiles:manifest.workingFrontendFiles||null,fixtureSha256:hash(readFileSync(join(root,"design.json"))),observerSha256:hash(observer),builds},null,2));
}
export function staticPath(dist,pathname){let decoded;try{decoded=decodeURIComponent(pathname);}catch{return null;}const file=resolve(dist,"."+decoded);return file.startsWith(resolve(dist)+sep)?file:null;}
/** 프록시 대상은 정해진 로컬 API뿐이다. 입력 URL로 임의의 서버에 전달하지 않는다. */
export function gateway(root,variant){
  assert.ok(Object.hasOwn(COMMITS,variant));const dist=join(root,"dist",variant),backendPort=variant==="before"?18910:18911;
  const account=JSON.parse(readFileSync(join(root,"account-private.json"),"utf8"));
  const server=createServer((req,res)=>{
    const url=new URL(req.url,"http://127.0.0.1");
    if(!["127.0.0.1","localhost"].includes((req.headers.host||"").split(":")[0])){res.writeHead(403);res.end();return;}
    res.setHeader("Cache-Control","no-store");
    res.setHeader("Content-Security-Policy","default-src 'self' blob: data:; img-src 'self' http://127.0.0.1:18903 blob: data:; connect-src 'self' ws://127.0.0.1:18900 ws://localhost:18901 http://127.0.0.1:18903; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; frame-src 'none'; object-src 'none'");
    if(url.pathname.startsWith("/api/")||url.pathname==="/ws"){
      const allowed=["GET","HEAD","OPTIONS"].includes(req.method)
        ||(req.method==="POST"&&["/api/v1/auth/login","/api/v1/auth/logout","/api/v1/auth/refresh"].includes(url.pathname))
        ||(req.method==="PUT"&&/^\/api\/v1\/me\/onboarding\/(WELCOME|JAR_LIST|JAR_CREATE|JAR_DETAIL|JAR_INVITE|DAILY_DRAW)$/.test(url.pathname));
      if(!allowed){res.writeHead(405);res.end();return;}
      const proxy=httpRequest({hostname:"127.0.0.1",port:backendPort,path:url.pathname+url.search,method:req.method,headers:req.headers},response=>{
        res.writeHead(response.statusCode,{...response.headers,"cache-control":"no-store"});response.pipe(res);
      });proxy.on("error",()=>{if(!res.headersSent)res.writeHead(502);res.end("Local backend unavailable");});req.pipe(proxy);return;
    }
    if(req.method!=="GET"){res.writeHead(405);res.end();return;}
    if(url.pathname==="/__comparison/provider-stats"){
      const upstream=httpRequest({hostname:"127.0.0.1",port:18903,path:"/__fixture/stats",method:"GET"},response=>{
        let value="";response.setEncoding("utf8");response.on("data",chunk=>{value+=chunk;if(value.length>1024)upstream.destroy();});
        response.on("end",()=>{try{const data=JSON.parse(value);assert.ok(Number.isSafeInteger(data.imageReads)&&data.imageReads>=0);res.setHeader("Content-Type","application/json");res.end(JSON.stringify({imageReads:data.imageReads}));}catch{res.writeHead(502);res.end();}});
      });upstream.on("error",()=>{if(!res.headersSent)res.writeHead(502);res.end();});upstream.end();return;
    }
    if(url.pathname==="/__comparison/start"){
      res.setHeader("Content-Type","text/html; charset=utf-8");
      res.end(`<!doctype html><meta charset="utf-8"><h1>${variant==="before"?"초기 구현":"현재 구현"} · 로컬 비교</h1><p>합성 데이터만 사용하는 별도 환경입니다. 실제 AWS/운영 성능은 측정하지 않습니다.</p><button id="start">시험 계정으로 로그인하고 저금통 열기</button><p id="status"></p><script>document.querySelector('#start').onclick=async()=>{try{const c=await(await fetch('/api/v1/csrf')).json();const r=await fetch('/api/v1/auth/login',{method:'POST',headers:{'Content-Type':'application/json',[c.data.headerName]:c.data.token},body:JSON.stringify(${JSON.stringify(account)})});if(!r.ok)throw Error('로그인 실패');location.href='/jars/112';}catch(e){document.querySelector('#status').textContent=e.message;}};</script>`);return;
    }
    if(url.pathname==="/__comparison/monitor.mjs"){res.setHeader("Content-Type","text/javascript; charset=utf-8");res.end(readFileSync(join(root,"monitor.mjs")));return;}
    let file=url.pathname==="/"?join(dist,"index.html"):staticPath(dist,url.pathname);
    if(!file){res.writeHead(403);res.end();return;}
    if(!existsSync(file)){if(extname(url.pathname)){res.writeHead(404);res.end();return;}file=join(dist,"index.html");}
    const types={".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".css":"text/css; charset=utf-8",".svg":"image/svg+xml",".png":"image/png",".woff2":"font/woff2"};
    res.setHeader("Content-Type",types[extname(file)]||"application/octet-stream");createReadStream(file).on("error",()=>res.destroy()).pipe(res);
  });
  server.on("upgrade",(req,socket,head)=>{
    const host=(req.headers.host||"").split(":")[0];
    if(req.url!=="/ws"||!["127.0.0.1","localhost"].includes(host)){socket.destroy();return;}
    const upstream=connect(backendPort,"127.0.0.1",()=>{upstream.write(`${req.method} /ws HTTP/1.1\r\n`+Object.entries(req.headers).map(([k,v])=>`${k}: ${v}`).join("\r\n")+"\r\n\r\n");if(head.length)upstream.write(head);socket.pipe(upstream).pipe(socket);});
    upstream.on("error",()=>socket.destroy());socket.on("error",()=>upstream.destroy());
  });
  return server;
}
async function serve(root){
  const servers=[];
  for(const variant of ["before","after"]){const server=gateway(root,variant);await new Promise((resolve,reject)=>server.once("error",reject).listen(variant==="before"?18900:18901,"127.0.0.1",resolve));servers.push(server);}
  writeFileSync(join(root,"gateway-ready.json"),JSON.stringify({ready:true,pid:process.pid,origins:ORIGINS}));
  const deadline=setTimeout(stop,2*60*60*1000);
  const poll=setInterval(()=>{if(existsSync(join(root,"STOP")))stop();},500);
  function stop(){clearTimeout(deadline);clearInterval(poll);for(const server of servers){server.closeAllConnections();server.close();}setTimeout(()=>process.exit(0),200).unref();}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const action=process.argv[2],root=validateRoot(process.argv[3]);
  if(action==="overlay")overlayWorkingFrontend(root);else if(action==="prepare")await prepare(root);else if(action==="serve")await serve(root);else throw Error("overlay, prepare or serve required");
}
