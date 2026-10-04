import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepareSourceUpload, MAX_UPLOAD_BYTES, MAX_UPLOAD_EDGE } from './sourceUpload.mjs';

test('small files are snapshotted once without loss or browser decode', async () => {
  const source=new File([new Uint8Array([137,80,78,71])],'small.png',{type:'image/png',lastModified:123});
  const upload=await prepareSourceUpload(source);
  assert.notEqual(upload,source);
  assert.equal(upload.type,'image/png');
  assert.equal(upload.name,'small.png');
  assert.equal(upload.lastModified,123);
  assert.deepEqual(await upload.arrayBuffer(),await source.arrayBuffer());
  assert.equal(MAX_UPLOAD_EDGE,1280);
  assert.ok(MAX_UPLOAD_BYTES<1024*1024);
});
test('cloud-provider read failure has manual-reselect guidance, no retry', async () => {
  let calls=0;
  await assert.rejects(prepareSourceUpload({arrayBuffer(){calls++;throw new Error('unavailable');}}),/다운로드한 사진/);
  assert.equal(calls,1);
});
test('unnamed Blob receives a safe file name', async () => {
  const result=await prepareSourceUpload(new Blob(['data'],{type:'image/png'}));
  assert.equal(result.name,'jar-design-original.png');
});
