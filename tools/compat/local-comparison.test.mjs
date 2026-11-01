/** 격리 경로·관찰 코드의 원본 보존·로컬 게이트웨이 제한을 실제 HTTP와 고정 Git 소스로 검사한다. */
import test from "node:test";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {mkdirSync,writeFileSync,readFileSync,rmSync} from "node:fs";
import {join,resolve} from "node:path";
import {randomUUID} from "node:crypto";
import {request} from "node:http";
import {BASELINES,commitsFor,instrument,validateRoot,staticPath,gateway,overlayWorkingFrontend} from "./local-comparison.mjs";
const project=resolve(import.meta.dirname,"../..");
for(const baseline of Object.keys(BASELINES))for(const variant of ["before","after"])test(`${baseline}/${variant}: 사진 준비 조건과 원본 소스를 보존한다`,()=>{
  const source=execFileSync("git",["show",`${commitsFor(baseline)[variant]}:frontend/src/features/jarDesign/components/CustomJarBody3D.jsx`],{cwd:project,encoding:"utf8"});
  const result=instrument(source,variant,baseline);
  const restored=result.replace(/\n        globalThis\.__memoryJarComparison\?\.frame\(stage,[^\n]+\);/,"")
    .replace("function fail(message) { globalThis.__memoryJarComparison?.fail();","function fail(message) {");
  assert.equal(restored,source);
  assert.match(result,variant==="before"&&baseline==="c5f58c4"?/frame\(stage,true,/:/frame\(stage,borderReady && photoReady,/);
});
test("허용한 기준 커밋만 선택한다",()=>{assert.equal(commitsFor().before,BASELINES.dd6e50b);assert.throws(()=>commitsFor("main"));assert.throws(()=>commitsFor("toString"));assert.throws(()=>instrument("","before","unknown"));});
for(const baseline of ["dd6e50b","8a5f7cc"])test(`${baseline}: 작업 수정본은 after 계산 두 파일만 복사하고 before는 보존한다`,()=>{
  const root=validateRoot(join(project,"build/local-comparison","local-compare-"+randomUUID().replaceAll("-","").slice(0,12)));
  const files=["frontend/src/features/jarDesign/body3DMesh.mjs","frontend/src/features/jarDesign/body3DBase.mjs"];
  mkdirSync(root,{recursive:true});
  try{
    writeFileSync(join(root,"run-public.json"),JSON.stringify({baseline:"c5f58c4",workingFrontend:true,commits:commitsFor("c5f58c4")}));
    assert.throws(()=>overlayWorkingFrontend(root));
    writeFileSync(join(root,"run-public.json"),JSON.stringify({baseline,workingFrontend:true,commits:commitsFor(baseline)}));
    for(const variant of ["before","after"])for(const file of files){
      mkdirSync(join(root,variant,"frontend/src/features/jarDesign"),{recursive:true});
      writeFileSync(join(root,variant,file),execFileSync("git",["show",`${commitsFor(baseline)[variant]}:${file}`],{cwd:project}));
    }
    overlayWorkingFrontend(root);
    const manifest=JSON.parse(readFileSync(join(root,"run-public.json"),"utf8"));
    assert.deepEqual(Object.keys(manifest.workingFrontendFiles),files);
    for(const file of files){
      assert.deepEqual(readFileSync(join(root,"after",file)),readFileSync(join(project,file)));
      assert.deepEqual(readFileSync(join(root,"before",file)),execFileSync("git",["show",`${commitsFor(baseline).before}:${file}`],{cwd:project}));
    }
    assert.throws(()=>overlayWorkingFrontend(root),/Pinned archive changed/);
  }finally{assert.equal(validateRoot(root),root);rmSync(root,{recursive:true});}
});
test("관찰 위치·버전이 달라지면 빌드를 거절한다",()=>{
  assert.throws(()=>instrument("no anchor","before"));
  assert.throws(()=>instrument("stage.dataset.side=photoSurface.side; stage.dataset.side=photoSurface.side;","after"));
  assert.throws(()=>instrument("stage.dataset.side=photoSurface.side; function fail(message) {","unknown"));
});
test("작업 공간 밖·잘못된 실행 경로를 거절한다",()=>{
  assert.throws(()=>validateRoot("C:/outside/local-compare-123456789abc"));
  assert.throws(()=>validateRoot(join(project,"build/local-comparison/other")));
  assert.equal(validateRoot(join(project,"build/local-comparison/local-compare-123456789abc")),resolve(project,"build/local-comparison/local-compare-123456789abc"));
});
test("정적 파일의 경로 탈출·잘못된 인코딩을 거절한다",()=>{
  const root=join(project,"build/test-static");
  assert.equal(staticPath(root,"/assets/a.js"),join(root,"assets/a.js"));
  assert.equal(staticPath(root,"/../private"),null);
  assert.equal(staticPath(root,"/%2e%2e/private"),null);
  assert.equal(staticPath(root,"/%zz"),null);
});
test("게이트웨이는 외부 Host·쓰기 API·없는 청크를 거절하고 계정은 시험 시작 화면에서만 제공한다",async()=>{
  const root=validateRoot(join(project,"build/local-comparison","local-compare-"+randomUUID().replaceAll("-","").slice(0,12)));
  mkdirSync(join(root,"dist/before"),{recursive:true});
  writeFileSync(join(root,"dist/before/index.html"),"<h1>fixture</h1>");
  writeFileSync(join(root,"account-private.json"),JSON.stringify({loginId:"fixture",password:"fake-test-only"}));
  const server=gateway(root,"before");
  await new Promise(r=>server.listen(0,"127.0.0.1",r));
  const base=`http://127.0.0.1:${server.address().port}`;
  try{
    const page=await fetch(base+"/jars/112");assert.equal(page.status,200);assert.match(await page.text(),/fixture/);
    assert.match(page.headers.get("content-security-policy"),/connect-src 'self'/);
    assert.equal((await fetch(base+"/assets/missing.js")).status,404);
    assert.equal((await fetch(base+"/api/v1/jars",{method:"POST"})).status,405);
    assert.equal((await fetch(base+"/api/v1/jars/112",{method:"DELETE"})).status,405);
    assert.equal((await fetch(base+"/api/v1/auth/login",{method:"PUT"})).status,405);
    const badHost=await new Promise((resolve,reject)=>{const r=request(base+"/",{headers:{Host:"outside.invalid"}},response=>{response.resume();resolve(response.statusCode);});r.on("error",reject);r.end();});
    assert.equal(badHost,403);
    const start=await(await fetch(base+"/__comparison/start")).text();assert.match(start,/fake-test-only/);
  }finally{
    server.closeAllConnections();await new Promise(r=>server.close(r));
    // 방금 생성한 시험 루트이며 실제 프로젝트·다른 실행 폴더를 재귀 삭제하지 않는다.
    assert.equal(validateRoot(root),root);rmSync(root,{recursive:true});
  }
});
