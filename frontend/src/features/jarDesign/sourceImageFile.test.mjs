import test from "node:test";
import assert from "node:assert/strict";
import { prepareSourceImage, MAX_SOURCE_IMAGE_BYTES } from "./sourceImageFile.mjs";

test("모바일 MIME 누락·별칭에도 실제 JPEG/PNG/WebP 바이트와 파일명을 보존한다", async () => {
  for (const [header,type] of [[[255,216,255,224],"image/jpeg"],[[137,80,78,71,13,10,26,10],"image/png"],[[82,73,70,70,0,0,0,0,87,69,66,80],"image/webp"]]) {
    for (const mime of ["", "application/octet-stream", type]) {
      const file=new File([new Uint8Array(header)],"휴대폰 사진.jpg",{type:mime,lastModified:123});
      const prepared=await prepareSourceImage(file);
      assert.equal(prepared.type,type); assert.equal(prepared.name,file.name); assert.equal(prepared.lastModified,123);
      assert.deepEqual(await prepared.arrayBuffer(),await file.arrayBuffer());
      if (mime===type) assert.equal(prepared,file);
    }
  }
});
test("가짜 확장자·MIME, HEIC, 빈 파일, 초과 용량은 명확하게 안내한다", async () => {
  await assert.rejects(prepareSourceImage(new File(["invalid"],"fake.png",{type:"image/png"})),/PNG, JPEG/);
  await assert.rejects(prepareSourceImage(new File(["\0\0\0\0ftypheic"],"mobile.HEIC")),/JPEG 또는 PNG/);
  await assert.rejects(prepareSourceImage(new File([],"empty.jpg")),/내용이 없는/);
  let read=false;
  await assert.rejects(prepareSourceImage({size:MAX_SOURCE_IMAGE_BYTES+1,slice(){read=true;}}),/10MB/);
  assert.equal(read,false);
  await assert.rejects(prepareSourceImage({size:12,slice(){return {arrayBuffer(){throw new Error("provider unavailable");}};}}),/기기에 다운로드/);
});
