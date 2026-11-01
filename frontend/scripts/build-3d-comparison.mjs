/**
 * 현재 앱의 3D 계산 파일만 고정된 수정 전/후 코드로 바꿔 운영 비교용 빌드 두 개를 만든다.
 * 원본 소스·일반 dist·Git 이력을 수정하거나 배포하지 않는다. 실행은 frontend에서 한다.
 */
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {createHash, randomUUID} from "node:crypto";
import {existsSync, mkdirSync, readFileSync, writeFileSync} from "node:fs";
import {join, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {build, loadEnv, normalizePath} from "vite";

const frontendRoot=fileURLToPath(new URL("../",import.meta.url));
const projectRoot=resolve(frontendRoot,"..");
const meshPath="frontend/src/features/jarDesign/body3DMesh.mjs";
const meshFile=resolve(projectRoot,meshPath);
const fixture=JSON.parse(readFileSync(new URL("../tests/fixtures/preparedBodyGeometryBefore.json",import.meta.url),"utf8"));
const comparison=JSON.parse(readFileSync(new URL("../../docs/performance/3d/rim-cpu-comparison-catalog-2026-10-26.json",import.meta.url),"utf8"));
const hash=value=>createHash("sha256").update(value).digest("hex");
const git=(...args)=>execFileSync("git",args,{cwd:projectRoot,encoding:"utf8",stdio:["ignore","pipe","pipe"]}).trim();

/** 다른 수정이 섞인 결과를 기존 측정의 수정 전/후 버전으로 잘못 배포하지 않도록 거절한다. */
function verifySources() {
  assert.equal(fixture.baselineRef,comparison.baselineRef,"로컬 비교와 수정 전 기준이 다릅니다.");
  // show 결과의 마지막 개행도 해시에 포함해야 하므로 trim하는 git 보조 함수는 사용하지 않는다.
  const before=execFileSync("git",["show",`${fixture.baselineRef}:${meshPath}`],{cwd:projectRoot});
  const after=readFileSync(meshFile);
  assert.equal(hash(before),fixture.beforeMeshSha256,"고정된 수정 전 코드와 다릅니다.");
  assert.equal(hash(before),comparison.sourceHashes.before,"반복 비교의 수정 전 코드와 다릅니다.");
  assert.equal(hash(after),comparison.sourceHashes.after,"현재 계산 코드가 측정한 수정 후 버전과 다릅니다.");
  git("diff","--exit-code","HEAD","--","frontend");
  return {before,after};
}

/** 운영용 빌드에 로컬 API가 섞이지 않도록 공개 접속 주소만 확인하고 비밀값은 출력하지 않는다. */
function verifyEnvironment() {
  const env=loadEnv("production",frontendRoot,"VITE_");
  const api=new URL(env.VITE_API_BASE_URL);
  const socket=new URL(env.VITE_WS_BASE_URL);
  assert.equal(api.protocol,"https:","운영 비교에는 HTTPS API 주소가 필요합니다.");
  assert.equal(socket.protocol,"wss:","운영 비교에는 WSS 주소가 필요합니다.");
  for(const url of [api,socket]) {
    assert.ok(!url.username&&!url.password&&!url.search&&!url.hash,"접속 주소에 인증정보나 쿼리를 넣지 않습니다.");
    assert.ok(!["localhost","127.0.0.1","[::1]"].includes(url.hostname),"로컬 주소는 운영 비교에 사용할 수 없습니다.");
  }
  return {apiOrigin:api.origin,socketOrigin:socket.origin};
}

/** 파일을 덮어쓰는 대신 Vite가 읽는 메모리 안에서 계산 모듈 하나만 교체한다. */
function meshPlugin(source) {
  let reads=0;
  return {
    name:"memoryjar-fixed-comparison-mesh",
    enforce:"pre",
    load(id) {
      if(normalizePath(id.split("?")[0])!==normalizePath(meshFile))return null;
      reads++;
      return source.toString("utf8");
    },
    generateBundle() {
      assert.equal(reads,1,"3D 계산 파일이 정확히 한 번 교체되지 않았습니다.");
    },
  };
}

async function main() {
  if(process.argv.length!==2)throw new Error("인수 없이 실행합니다. 접속 주소는 기존 VITE_ 환경변수로 설정하세요.");
  const sources=verifySources();
  const environment=verifyEnvironment();
  const hostingConfig=readFileSync(join(frontendRoot,"vercel.json"));
  JSON.parse(hostingConfig.toString("utf8"));
  const baselineCommit=git("rev-parse",fixture.baselineRef);
  const currentCommit=git("rev-parse","HEAD");
  const runId=`${new Date().toISOString().replaceAll(":","-")}-${randomUUID().slice(0,8)}`;
  const output=join(frontendRoot,"build","3d-comparison",runId);
  assert.ok(!existsSync(output),"기존 비교 빌드를 덮어쓰지 않습니다.");
  mkdirSync(output,{recursive:true});
  const variants=[];
  for(const variant of ["before","after"]) {
    const source=sources[variant];
    const outDir=join(output,variant);
    await build({root:frontendRoot,configFile:join(frontendRoot,"vite.config.js"),mode:"production",
      plugins:[meshPlugin(source)],build:{outDir,emptyOutDir:false}});
    // 공개 가능한 버전 식별값만 저장한다. 쿠키·전체 환경변수·사진·실제 저금통 번호는 기록하지 않는다.
    const manifest={version:1,variant,scope:"테두리 계산 최적화만 비교. 백엔드·이미지 캐시·인증 설정은 현재 상태 유지.",
      baselineCommit,currentCommit,meshSha256:hash(source),environment,
      completion:"빌드 성공. 배포 및 운영 성능 검증을 뜻하지 않음."};
    writeFileSync(join(outDir,"comparison-build.json"),JSON.stringify(manifest,null,2)+"\n");
    // 상세 주소로 직접 접근해도 index.html을 제공하도록 기존 Vercel SPA 경로 설정을 함께 둔다.
    writeFileSync(join(outDir,"vercel.json"),hostingConfig);
    variants.push({...manifest,directory:variant});
    assert.deepEqual(readFileSync(meshFile),sources.after,"빌드 도중 현재 계산 파일이 변경됐습니다.");
  }
  writeFileSync(join(output,"comparison-manifest.json"),JSON.stringify({version:1,variants},null,2)+"\n");
  console.log(`비교 빌드 완료: ${output}\n자동 배포하지 않았습니다. before/after를 같은 운영 주소와 설정으로 측정하세요.`);
}

main().catch(error=>{
  // 환경변수 값이나 외부 명령의 원문 오류를 추가로 노출하지 않는다.
  console.error(error instanceof assert.AssertionError?error.message:"비교 빌드 실패. 기준 코드·공개 접속 주소·빌드 오류를 확인하세요.");
  process.exitCode=1;
});
