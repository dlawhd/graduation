import test from "node:test";
import assert from "node:assert/strict";
import {openTextureSource} from "./textureSource.mjs";
test("인증된 텍스처 경로만 읽고 Blob URL은 한 번 해제한다",async()=>{
  const calls=[],revoked=[];
  const source=await openTextureSource("https://storage.test/expired","/api/v1/jars/12/design/texture?part=IMAGE",{
    fetchBlob:async path=>{calls.push(path);return new Blob(["png"],{type:"image/png"});},
    createObjectURL:()=>"blob:local",revokeObjectURL:url=>revoked.push(url)});
  assert.equal(source.url,"blob:local");source.dispose();source.dispose();
  assert.equal(calls.length,1);assert.deepEqual(revoked,["blob:local"]);
});
test("이전 서버/로컬 예시는 원래 URL을 유지한다",async()=>{
  const source=await openTextureSource("data:image/png,test",null);
  assert.equal(source.url,"data:image/png,test");source.dispose();
});
test("외부 주소·부정 경로에 인증정보를 보내지 않는다",async()=>{
  for(const path of ["https://evil.test/api/v1/jars/1/design/texture?part=IMAGE","/api/v1/jars/0/design/texture?part=IMAGE","/api/v1/jars/1/design/texture?part=OTHER"])
    await assert.rejects(openTextureSource("",path,{fetchBlob:()=>{throw new Error("must not call");}}),/Invalid texture path/);
});
test("요청 취소·잘못된 이미지·API 실패에는 Blob URL을 만들지 않는다",async()=>{
  const path="/api/v1/jars/1/design/texture?part=BODY",abort=new AbortController();abort.abort();
  await assert.rejects(openTextureSource("",path,{signal:abort.signal,fetchBlob:async()=>new Blob(["png"],{type:"image/png"})}),/Cancelled/);
  await assert.rejects(openTextureSource("",path,{fetchBlob:async()=>new Blob(["bad"],{type:"text/html"})}),/Invalid texture image/);
  await assert.rejects(openTextureSource("",path,{fetchBlob:async()=>{throw new Error("403");}}),/403/);
});
