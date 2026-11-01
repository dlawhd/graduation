/** 실제 시험 API에서 같은 PNG와 로그인·CSRF·캐시 적중 뒤 권한 검사를 확인한다. 운영에는 접속하지 않는다. */
import assert from "node:assert/strict";
import {readFileSync,writeFileSync} from "node:fs";
import {join} from "node:path";
import {createHash} from "node:crypto";
import {validateRoot} from "./local-comparison.mjs";
const root=validateRoot(process.argv[2]);
const account=JSON.parse(readFileSync(join(root,"account-private.json"),"utf8"));
const fixture=JSON.parse(readFileSync(join(root,"design.json"),"utf8"));
const photo=JSON.parse(readFileSync(join(root,"photo-public.json"),"utf8"));
let stage="start";const passed=[];
function check(name,value){stage=name;assert.ok(value,name);passed.push(name);}

/** 실제 Cookie/CSRF를 처리하되 시험 비밀번호·쿠키·응답 원문은 보고서에 넣지 않는다. */
class TrialClient {
  constructor(base){this.base=base;this.cookies=new Map();}
  async send(path,method="GET",body){
    const headers={Cookie:[...this.cookies].map(([k,v])=>`${k}=${v}`).join("; ")};
    if(body!==undefined){headers["Content-Type"]="application/json";const csrf=await(await this.send("/api/v1/csrf")).json();headers[csrf.data.headerName]=csrf.data.token;headers.Cookie=[...this.cookies].map(([k,v])=>`${k}=${v}`).join("; ");}
    const r=await fetch(this.base+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(12000)});
    for(const value of r.headers.getSetCookie()){const pair=value.split(";",1)[0],i=pair.indexOf("=");this.cookies.set(pair.slice(0,i),pair.slice(i+1));}
    return r;
  }
  async login(loginId=account.loginId){return this.send("/api/v1/auth/login","POST",{loginId,password:account.password});}
}
try {
  for(const [variant,base] of [["before","http://127.0.0.1:18900"],["after","http://localhost:18901"]]){
    const owner=new TrialClient(base);
    check(variant+"-anonymous",(await owner.send("/api/v1/jars/112")).status===401);
    check(variant+"-login",(await owner.login()).status===200);
    const read=await owner.send("/api/v1/jars/112");check(variant+"-detail-status",read.status===200);
    const design=(await read.json()).data.design;
    check(variant+"-same-outline",JSON.stringify(design.customBody.points)===JSON.stringify(fixture.customBody.points)&&design.customBody.color===fixture.customBody.color);
    check(variant+"-same-photo-placement",["x","y","width","height","fit"].every(k=>design.photoFrame[k]===fixture.photoFrame[k]));
    const signed=new URL(design.imageUrl);
    check(variant+"-photo-url-is-local",signed.origin==="http://127.0.0.1:18903"&&signed.pathname==="/test-memory-jar-bucket/compatibility/fixture.png");
    const original=new Uint8Array(await(await fetch(signed,{signal:AbortSignal.timeout(10000)})).arrayBuffer());
    check(variant+"-same-photo-bytes",createHash("sha256").update(original).digest("hex")===photo.sha256);
    const outsider=new TrialClient(base);check(variant+"-outsider-login",(await outsider.login("localoutsider")).status===200);
    check(variant+"-membership",(await outsider.send("/api/v1/jars/112")).status===403);
    check(variant+"-missing-jar",(await owner.send("/api/v1/jars/999999")).status===404);
    check(variant+"-writes-blocked",(await owner.send("/api/v1/jars/112","DELETE")).status===405);
    if(variant==="after"){
      const path="/api/v1/jars/112/design/texture?part=IMAGE";
      const first=await owner.send(path);check("texture-success",first.status===200&&first.headers.get("content-type").startsWith("image/png"));
      const firstBytes=new Uint8Array(await first.arrayBuffer());
      check("texture-same-png",createHash("sha256").update(firstBytes).digest("hex")===photo.sha256);
      const reads=async()=>(await(await fetch(base+"/__comparison/provider-stats")).json()).imageReads;
      const count=await reads();
      const again=await owner.send(path);check("texture-repeat-success",again.status===200);await again.arrayBuffer();
      check("texture-repeat-reuses-provider",await reads()===count);
      check("cached-texture-outsider-rejected",(await outsider.send(path)).status===403);
      check("cached-texture-anonymous-rejected",(await new TrialClient(base).send(path)).status===401);
      check("texture-invalid-part",(await owner.send("/api/v1/jars/112/design/texture?part=UNKNOWN")).status===400);
      check("rejected-reads-never-touch-provider",await reads()===count);
    }
  }
  const result={status:"PASS",checksPassed:passed.length,checksFailed:0,checks:passed,actualAwsUsed:false};
  writeFileSync(join(root,"http-check-public.json"),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}catch(error){const result={status:"FAIL",checksPassed:passed.length,checksFailed:1,failedStage:stage,exceptionType:error.name};writeFileSync(join(root,"http-check-public.json"),JSON.stringify(result,null,2));console.error(JSON.stringify(result));process.exitCode=1;}
