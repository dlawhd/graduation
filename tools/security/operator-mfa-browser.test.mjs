import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

// 실제 React 인증 화면과 CSS를 별도 Chrome 프로필에서 시험한다. 인증 번호·키는 전부 합성 시험값이다.
async function browserCase(t, scenario, width) {
  const chrome = process.env.MEMORYJAR_TEST_CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
  if (!existsSync(chrome)) { t.skip("Isolated Chrome is not installed"); return; }
  const root = resolve(import.meta.dirname, "../..");
  const require = createRequire(resolve(root, "frontend/package.json"));
  const { build } = await import(pathToFileURL(require.resolve("vite")).href);
  const { default: react } = await import(pathToFileURL(require.resolve("@vitejs/plugin-react")).href);
  const { default: tailwindcss } = await import(pathToFileURL(require.resolve("@tailwindcss/vite")).href);
  const entry = `import React,{useEffect} from 'react';import{createRoot}from'react-dom/client';
    import{MemoryRouter}from'react-router-dom';import Gate from '@gate';import '@styles';
    const root=createRoot(document.querySelector('#app'));window.__testAccount=1;
    function PrivateContent(){useEffect(()=>{fetch('/private?account='+window.__testAccount);},[]);return <div id='private-data'>protected inquiry</div>;}
    const render=()=>root.render(<MemoryRouter><Gate key={window.__testAccount} userId={window.__testAccount}><PrivateContent/></Gate></MemoryRouter>);
    const wait=async(fn)=>{for(let i=0;i<600;i++){if(fn())return;await new Promise(r=>setTimeout(r,5));}throw Error('UI wait failed');};
    const text=value=>[...document.querySelectorAll('button')].find(b=>b.textContent.includes(value));
    const input=(selector,value)=>{const node=document.querySelector(selector);if(!node)throw Error('Input absent');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(node,value);node.dispatchEvent(new Event('input',{bubbles:true}));};
    const submit=()=>document.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
    const tick=()=>new Promise(r=>setTimeout(r,20));
    const check=(value,message)=>{if(!value)throw Error(message);};
    async function exercise(){render();
      if('${scenario}'==='expiry'){
        await wait(()=>document.querySelector('#private-data'));await wait(()=>!document.querySelector('#private-data'));
        check(text('복구 코드 사용'),'expired screen should ask for verification');
      }else if('${scenario}'==='account-switch'){
        await wait(()=>text('추가 인증 확인'));input('input[pattern="[0-9]{6}"]','123456');await tick();submit();
        window.__testAccount=2;render();await tick();await new Promise(r=>setTimeout(r,250));
        check(!document.querySelector('#private-data'),'old verification reopened next account');
      }else{
        await wait(()=>text('인증 앱 등록 시작'));check(!document.querySelector('#private-data'),'private content rendered before authentication');
        input('input[type=password]','synthetic-bootstrap-code-for-local-browser-test');await tick();submit();submit();
        await wait(()=>document.querySelector('[aria-label="인증 앱 설정 키"]'));
        input('input[pattern="[0-9]{6}"]','123456');await tick();submit();
        await wait(()=>document.querySelector('[aria-label="일회용 복구 코드"]'));
        check(!document.querySelector('#private-data'),'private content rendered before saving backup codes');
        text('안전한 곳에 보관했어요').click();await wait(()=>document.querySelector('#private-data'));
        const peer=new BroadcastChannel('memoryjar-operator-mfa');peer.postMessage({type:'locked',userId:99});await tick();
        check(document.querySelector('#private-data'),'another account locked this account');
        peer.postMessage({type:'locked',userId:1});await wait(()=>!document.querySelector('#private-data'));peer.close();
        text('복구 코드 사용').click();await tick();input('input[pattern="[a-fA-F0-9]{32}"]','00000000000000000000000000000001');await tick();submit();
        await wait(()=>document.querySelector('#private-data'));window.dispatchEvent(new Event('memoryjar:operator-mfa-required'));
        await wait(()=>!document.querySelector('#private-data'));input('input[pattern="[0-9]{6}"]','123456');await tick();submit();
        await wait(()=>document.querySelector('#private-data'));text('운영 문의함 잠그기').click();await wait(()=>!document.querySelector('#private-data'));
        check(!document.querySelector('[aria-label="인증 앱 설정 키"]'),'secret remained after enrollment');
      }
      check(localStorage.length===0&&sessionStorage.length===0,'authentication data persisted in browser storage');
      check(document.querySelector('[aria-label="운영자 추가 인증"]'),'authentication form disappeared');
      check(document.documentElement.scrollWidth<=innerWidth+1,'mobile horizontal overflow');
      check([...document.querySelectorAll('main,section,form,input,button')].every(el=>{
        const bounds=el.getBoundingClientRect();return bounds.right<=document.documentElement.clientWidth+1&&bounds.left>=-1;
      }),'authentication control clipped outside viewport');
      document.querySelector('#result').textContent='passed';
    }
    exercise().catch(e=>document.querySelector('#result').textContent='ERROR:'+e.message);`;
  const apiModule = `async function call(path,body,options={}){const response=await fetch('/mfa/'+path+'?account='+window.__testAccount,
    {method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:options.signal});
    const result=await response.json();if(!response.ok)throw{response:{status:response.status,data:result}};return result;}
    export const getOperatorMfa=options=>call('status',undefined,options);
    export const sendOperatorMfa=(action,body,options)=>call(action,body,options);`;
  const output = await build({ root: resolve(root, "frontend"), configFile: false, logLevel: "silent",
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
    resolve: { alias: [{ find: /^react$/, replacement: require.resolve("react") },
      { find: /^react\/jsx-runtime$/, replacement: require.resolve("react/jsx-runtime") },
      { find: /^react-dom\/client$/, replacement: require.resolve("react-dom/client") },
      { find: /^react-router-dom$/, replacement: require.resolve("react-router-dom") },
      { find: "@gate", replacement: resolve(root, "frontend/src/features/support/OperatorMfaGate.jsx") },
      { find: "@styles", replacement: resolve(root, "frontend/src/index.css") }] },
    plugins: [react(), tailwindcss(), { name: "isolated-mfa-fixture", enforce: "pre",
      resolveId(id, importer) {
        if (id.endsWith("mfa-fixture.jsx")) return "\0mfa-fixture.jsx";
        if (id.endsWith("operatorMfaApi") && importer?.endsWith("OperatorMfaGate.jsx")) return "\0mfa-api-fixture";
      },
      load(id) { if (id === "\0mfa-fixture.jsx") return entry; if (id === "\0mfa-api-fixture") return apiModule; }
    }],
    build: { write: false, minify: false, lib: { entry: "mfa-fixture.jsx", formats: ["es"] } } });
  const outputs = (Array.isArray(output) ? output : [output]).flatMap(item => item.output);
  const bundle = outputs.filter(item => item.type === "chunk").map(item => item.code).join("\n");
  const css = outputs.filter(item => item.type === "asset" && item.fileName.endsWith(".css")).map(item => item.source).join("\n");
  let enrolled = scenario !== "full", granted = scenario === "expiry", enrollments = 0, privateReads = 0, child;
  const server = createServer(async (req, res) => {
    if (req.url.startsWith("/mfa/")) {
      let raw = ""; for await (const chunk of req) raw += chunk;
      const body = raw ? JSON.parse(raw) : {}, url = new URL(req.url, "http://localhost");
      res.setHeader("Content-Type", "application/json");
      if (url.pathname === "/mfa/status") {
        res.end(JSON.stringify({ configured: true, enrolled, bootstrapAvailable: true,
          verifiedUntil: granted && url.searchParams.get("account") === "1" ? new Date(Date.now() + 250).toISOString() : null })); return;
      }
      if (url.pathname === "/mfa/enrollment") { enrollments++; res.end(JSON.stringify({ secret: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", issuer: "Memory Jar", account: "fixture" })); return; }
      if (url.pathname === "/mfa/lock") { granted = false; res.end("{}"); return; }
      if (body.code !== "123456" && body.code !== "00000000000000000000000000000001") { res.writeHead(400); res.end('{"error":{"message":"invalid"}}'); return; }
      if (scenario === "account-switch") await new Promise(r => setTimeout(r, 180));
      granted = true; enrolled = true;
      res.end(JSON.stringify({ verifiedUntil: new Date(Date.now() + 900000).toISOString(),
        recoveryCodes: url.pathname.endsWith("confirmation") ? Array.from({ length: 10 }, (_, i) => (i + 1).toString(16).padStart(32, "0")) : [] })); return;
    }
    if (req.url.startsWith("/private")) { privateReads++; res.end("{}"); return; }
    if (req.url === "/fixture.js") { res.setHeader("Content-Type", "text/javascript"); res.end(bundle); return; }
    if (req.url === "/style.css") { res.setHeader("Content-Type", "text/css"); res.end(css); return; }
    res.setHeader("Content-Type", "text/html");
    res.end('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/style.css"><output id="result">pending</output><div id="app"></div><script type="module" src="/fixture.js"></script>');
  });
  try {
    await new Promise(r => server.listen(0, "127.0.0.1", r));
    const destination = resolve(root, "build/operator-mfa-browser"); await mkdir(destination, { recursive: true });
    const profile = await mkdtemp(resolve(destination, "profile-"));
    child = spawn(chrome, ["--headless=new", "--dump-dom", "--virtual-time-budget=15000", `--window-size=${width},900`,
      `--screenshot=${resolve(destination, `${scenario}-${width}-final.png`)}`, `--user-data-dir=${profile}`,
      "--disable-background-networking", "--disable-component-update", "--disable-sync", "--disable-extensions", "--disable-gpu",
      "--no-first-run", "--no-default-browser-check", "--no-proxy-server", `http://127.0.0.1:${server.address().port}/`],
      { windowsHide: true, stdio: ["ignore", "pipe", "ignore"] });
    let html = ""; child.stdout.on("data", chunk => { html += chunk; });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { child.kill(); reject(new Error("Isolated Chrome timed out")); }, 35000);
      child.once("error", error => { clearTimeout(timer); reject(error); });
      child.once("exit", code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(`Chrome exit ${code}`)); });
    });
    assert.match(html, /<output id="result">passed<\/output>/, html.match(/<output id="result">([^<]*)/)?.[1]);
    assert.match(html, /aria-label="운영자 추가 인증"/);
    await writeFile(resolve(destination, `${scenario}-${width}-final.html`), html);
    if (scenario === "full") { assert.equal(enrollments, 1); assert.ok(privateReads >= 2); }
    if (scenario === "account-switch") assert.equal(privateReads, 0);
  } finally {
    if (child && child.exitCode === null) child.kill();
    server.closeAllConnections(); await new Promise(r => server.close(r));
  }
}

test("operator MFA registration, backup acknowledgement, recovery, server rejection and locking on mobile", { timeout: 60000 }, t => browserCase(t, "full", 375));
test("operator data is removed automatically when additional authentication expires", { timeout: 60000 }, t => browserCase(t, "expiry", 1280));
test("a late verification response cannot open a different account", { timeout: 60000 }, t => browserCase(t, "account-switch", 375));
