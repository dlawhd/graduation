import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, mkdir, mkdtemp } from "node:fs/promises";
import { resolve } from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

// 실제 사용자 프로필·운영 서버 없이 브라우저의 쿠키·이미지·영상·302/Range 계약을 검사한다.
async function exerciseBrowser(t, recoverSession = false) {
  const chrome = process.env.MEMORYJAR_TEST_CHROME || (process.platform === "win32"
    ? "C:/Program Files/Google/Chrome/Application/chrome.exe" : "/usr/bin/google-chrome");
  if (!existsSync(chrome)) { t.skip("Chrome executable is not installed"); return; }
  const root = resolve(import.meta.dirname, "../..");
  const module = await readFile(resolve(root, "frontend/src/api/privateMedia.mjs"));
  const video = await readFile(resolve(root, "src/test/resources/media-security/video.mp4"));
  const image = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6ioAAAAASUVORK5CYII=", "base64");
  let authorized = 0, ranges = 0, denied = 0, storageCookies = 0, sessionChecks = 0;
  let bundle;
  const servers = [];
  let child;
  async function listen(handler) {
    const server = createServer(handler); servers.push(server);
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    return server.address().port;
  }
  try {
    const storagePort = await listen((req, res) => {
      if (req.headers.cookie) storageCookies++;
      if (req.url === "/photo.png") {
        res.writeHead(200, { "Content-Type": "image/png", "Cache-Control": "no-store" }); res.end(image); return;
      }
      const range = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range || "");
      if (range) {
        ranges++; const start = Number(range[1]), end = Math.min(Number(range[2] || video.length - 1), video.length - 1);
        res.writeHead(206, { "Content-Type": "video/mp4", "Accept-Ranges": "bytes",
          "Content-Range": `bytes ${start}-${end}/${video.length}`, "Content-Length": end - start + 1 });
        res.end(video.subarray(start, end + 1));
      } else { res.writeHead(200, { "Content-Type": "video/mp4", "Content-Length": video.length }); res.end(video); }
    });
    const apiPort = await listen((req, res) => {
      if (req.url === "/api/v1/me" && req.headers.cookie?.includes("MJ_REFRESH_TEST=fixture")) {
        sessionChecks++;
        setTimeout(() => {
          res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": req.headers.origin,
            "Access-Control-Allow-Credentials": "true", "Set-Cookie": "MJ_PRIVATE_MEDIA_TEST=fixture; HttpOnly; Path=/; SameSite=Lax" });
          res.end('{"data":{"userId":1}}');
        }, 150);
        return;
      }
      if (!req.headers.cookie?.includes("MJ_PRIVATE_MEDIA_TEST=fixture") || req.headers["sec-fetch-site"] === "cross-site") {
        res.writeHead(401); res.end(); return;
      }
      if (req.url.includes("/999/")) { denied++; res.writeHead(404); res.end(); return; }
      authorized++;
      const path = req.url.includes("/1/") ? "/photo.png" : "/video.mp4";
      res.writeHead(302, { Location: `http://127.0.0.1:${storagePort}${path}`, "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer", "Cross-Origin-Resource-Policy": "same-site" }); res.end();
    });
    if (recoverSession) {
      const require = createRequire(resolve(root, "frontend/package.json"));
      const { build } = await import(pathToFileURL(require.resolve("vite")).href);
      const { default: react } = await import(pathToFileURL(require.resolve("@vitejs/plugin-react")).href);
      const base = `http://localhost:${apiPort}`;
      const entry = `import React,{useRef} from 'react';import {createRoot} from 'react-dom/client';
        import {PrivateImage,PrivateVideo} from '@privateMedia';
        const state={};const done=(key,value)=>{state[key]=value;if(Object.keys(state).length===3)
          document.querySelector('#result').textContent=JSON.stringify([state.image,state.video,state.denied]);};
        function Fixture(){const ref=useRef(null);return <>
          <PrivateImage ref={ref} src='${base}/api/v1/files/attachments/1/content'
            onLoad={event=>done('image',ref.current===event.currentTarget?event.currentTarget.naturalWidth:-1)}/>
          <PrivateVideo preload='metadata' src='${base}/api/v1/files/attachments/2/content'
            onLoadedMetadata={event=>done('video',event.currentTarget.videoHeight)}/>
          <PrivateImage src='${base}/api/v1/files/attachments/999/content' onError={()=>done('denied','denied')}/>
        </>;}createRoot(document.querySelector('#app')).render(<Fixture/>);`;
      const output = await build({ root: resolve(root, "frontend"), configFile: false, logLevel: "silent",
        define: { "process.env.NODE_ENV": JSON.stringify("production") },
        resolve: { alias: [{ find: /^react$/, replacement: require.resolve("react") },
          { find: /^react\/jsx-runtime$/, replacement: require.resolve("react/jsx-runtime") },
          { find: /^react-dom\/client$/, replacement: require.resolve("react-dom/client") },
          { find: "@privateMedia", replacement: resolve(root, "frontend/src/components/PrivateMedia.jsx") }] },
        plugins: [react(), { name: "isolated-private-media-api", enforce: "pre",
          resolveId(id, importer) {
            if (id.endsWith("private-media-test-entry.jsx")) return "\0private-media-test-entry.jsx";
            if (id === "./apiClient" && importer?.endsWith("privateMediaSession.js")) return "\0fixture-api";
          },
          load(id) {
            if (id === "\0private-media-test-entry.jsx") return entry;
            if (id === "\0fixture-api") return `export default {defaults:{baseURL:'${base}'},async get(path){
              const response=await fetch('${base}'+path,{credentials:'include'});if(!response.ok)throw new Error('expired');return response.json();}};`;
          } }],
        build: { write: false, minify: false, lib: { entry: "private-media-test-entry.jsx", formats: ["es"] } } });
      const chunks = Array.isArray(output) ? output.flatMap(result => result.output) : output.output;
      bundle = chunks.find(item => item.type === "chunk" && item.isEntry).code;
    }
    const frontPort = await listen((req, res) => {
      if (req.url === "/fixture.js") { res.writeHead(200, { "Content-Type": "text/javascript" }); res.end(bundle); return; }
      if (req.url === "/privateMedia.mjs") { res.writeHead(200, { "Content-Type": "text/javascript" }); res.end(module); return; }
      res.writeHead(200, { "Content-Type": "text/html", "Set-Cookie": recoverSession
        ? "MJ_REFRESH_TEST=fixture; HttpOnly; Path=/; SameSite=Lax" : "MJ_PRIVATE_MEDIA_TEST=fixture; HttpOnly; Path=/; SameSite=Lax" });
      if (recoverSession) { res.end('<!doctype html><output id="result">pending</output><div id="app"></div><script>window.onerror=message=>document.querySelector("#result").textContent="ERROR:"+message;</script><script type="module" src="/fixture.js"></script>'); return; }
      res.end(`<!doctype html><output id="result">pending</output><script type="module">
        import { resolvePrivateMedia } from '/privateMedia.mjs';
        const base='http://localhost:${apiPort}';
        const url=id=>resolvePrivateMedia({url:'/api/v1/files/attachments/'+id+'/content'},base,location.origin).url;
        const load=(tag,id,denial=false)=>new Promise((resolve,reject)=>{
          const item=document.createElement(tag);document.body.append(item);
          item.onerror=()=>denial?resolve('denied'):reject(new Error(tag+' failed'));
          if(tag==='img')item.onload=()=>denial?reject(new Error('private file visible')):resolve(item.naturalWidth);
          else {item.preload='metadata';item.onloadedmetadata=()=>resolve(item.videoHeight);}
          item.src=url(id);
        });
        Promise.all([load('img',1),load('video',2),load('img',999,true)])
          .then(value=>document.querySelector('#result').textContent=JSON.stringify(value))
          .catch(error=>document.querySelector('#result').textContent='ERROR:'+error.message);
      </script>`);
    });
    const profiles = resolve(root, "build/security-browser"); await mkdir(profiles, { recursive: true });
    const profile = await mkdtemp(resolve(profiles, "profile-"));
    child = spawn(chrome, ["--headless=new", "--dump-dom", "--virtual-time-budget=10000", `--user-data-dir=${profile}`,
      "--disable-background-networking", "--disable-component-update", "--disable-sync", "--disable-extensions",
      "--no-first-run", "--no-default-browser-check", "--disable-gpu", "--no-proxy-server",
      "--host-resolver-rules=MAP localhost 127.0.0.1", `http://localhost:${frontPort}/`],
    { windowsHide: true, stdio: ["ignore", "pipe", "ignore"] });
    let html = ""; child.stdout.on("data", chunk => { html += chunk; });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { child.kill(); reject(new Error("Isolated browser timed out")); }, 30000);
      child.once("error", error => { clearTimeout(timer); reject(error); });
      child.once("exit", code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(`Chrome exit ${code}`)); });
    });
    assert.match(html, /<output id="result">\[1,16,"denied"\]<\/output>/);
    assert.ok(authorized >= 2); assert.ok(ranges >= 1); assert.ok(denied >= 1); assert.equal(storageCookies, 0);
    if (recoverSession) assert.ok(sessionChecks >= 1 && sessionChecks <= 3);
  } finally {
    if (child && child.exitCode === null) child.kill();
    await Promise.all(servers.map(server => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); })));
  }
}

test("protected media works across API origins and redirects without forwarding the login cookie", { timeout: 45000 }, t => exerciseBrowser(t));
test("actual React media components recover expired access, forward image refs and stop retrying denied files", { timeout: 45000 }, t => exerciseBrowser(t, true));
