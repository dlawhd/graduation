import test from "node:test";
import assert from "node:assert/strict";
import {openTextureSource} from "./textureSource.mjs";

const photoPath="/api/v1/jars/112/design/texture?part=IMAGE";
const bodyPath="/api/v1/jars/112/design/texture?part=BODY";
const png=()=>new Blob(["synthetic-png"],{type:"image/png"});

test("사진과 테두리는 허용된 경로·취소 신호로 읽고 임시 URL을 한 번만 해제한다",async()=>{
  for(const path of [photoPath,bodyPath]){
    const abort=new AbortController(),calls=[],revoked=[];
    const source=await openTextureSource("https://storage.invalid/expired",path,{
      signal:abort.signal,fetchBlob:async(p,signal)=>{calls.push({p,signal});return png();},
      createObjectURL:()=>"blob:local-test",revokeObjectURL:url=>revoked.push(url)});
    assert.deepEqual(calls,[{p:path,signal:abort.signal}]);assert.equal(source.url,"blob:local-test");
    source.dispose();source.dispose();assert.deepEqual(revoked,["blob:local-test"]);
  }
});

test("기존 서버·Draft에 API 경로가 없으면 원래 사진을 유지하고 인증 요청을 보내지 않는다",async()=>{
  for(const path of [undefined,null,""]){
    const source=await openTextureSource("data:image/png,local",path,{fetchBlob:()=>assert.fail("unexpected request")});
    assert.equal(source.url,"data:image/png,local");source.dispose();
  }
});

test("외부 URL·경로 탈출·잘못된 번호·추가 쿼리에는 로그인 정보를 보내지 않는다",async()=>{
  for(const path of ["https://evil.invalid"+photoPath,"//evil.invalid"+photoPath,"/api/v1/jars/0/design/texture?part=IMAGE","/api/v1/jars/01/design/texture?part=IMAGE","/api/v1/jars/../design/texture?part=IMAGE",photoPath+"&extra=1",photoPath.replace("IMAGE","OTHER"),photoPath+"#x"]){
    let called=false;
    await assert.rejects(openTextureSource("",path,{fetchBlob:()=>{called=true;}}),/Invalid texture path/);
    assert.equal(called,false);
  }
});

test("권한 없음·로그인 만료·없는 사진·서버 실패를 원래 오류로 전달하고 S3로 우회하지 않는다",async()=>{
  for(const status of [401,403,404,500]){
    const error=Object.assign(new Error("fixture failure"),{status});let created=0;
    await assert.rejects(openTextureSource("https://storage.invalid/expired",photoPath,{
      fetchBlob:async()=>{throw error;},createObjectURL:()=>{created++;}}),e=>e===error);
    assert.equal(created,0);
  }
});

test("빈 이미지·다른 타입·상한 초과 응답은 임시 URL로 만들지 않는다",async()=>{
  for(const blob of [new Blob([],{type:"image/png"}),new Blob(["html"],{type:"text/html"}),new Blob([new Uint8Array(16*1024*1024+1)],{type:"image/png"}),{type:"image/png",size:3}]){
    await assert.rejects(openTextureSource("",photoPath,{fetchBlob:async()=>blob,createObjectURL:()=>assert.fail("unexpected URL")}),/Invalid texture image/);
  }
});

test("2D 복귀 후 늦게 끝난 응답에는 임시 URL과 새 사진을 만들지 않는다",async()=>{
  const abort=new AbortController();let resolveResponse,created=0;
  const result=openTextureSource("",photoPath,{signal:abort.signal,fetchBlob:()=>new Promise(resolve=>{resolveResponse=resolve;}),createObjectURL:()=>{created++;}});
  abort.abort();resolveResponse(png());
  await assert.rejects(result,/Cancelled texture load/);assert.equal(created,0);
});
