import test from "node:test";
import assert from "node:assert/strict";
import { createPhotoTextureLoader } from "./photoTextureLoader.mjs";

function fixture() {
  const requests = [], images = [], disposed = [], paints = [], errors = [];
  const loader = createPhotoTextureLoader({
    openSource(url, textureUrl, signal) {
      return new Promise((resolve, reject) => requests.push({ url, textureUrl, signal, resolve, reject }));
    },
    createImage() { const image = { naturalWidth: 480 }; images.push(image); return image; },
    onError() { errors.push("failed"); },
  });
  async function resolve(index) {
    requests[index].resolve({ url: `blob:${index}`, dispose() { disposed.push(index); } });
    await new Promise(setImmediate);
  }
  return { loader, requests, images, disposed, paints, errors, resolve };
}

test("테두리가 먼저 도착해도 진행 중인 사진 요청은 취소하거나 반복하지 않는다", async () => {
  const f = fixture();
  f.loader.update("photo", "IMAGE", image => f.paints.push(image.src));
  f.loader.repaint(); f.loader.repaint();
  assert.equal(f.requests.length, 1);
  assert.equal(f.requests[0].signal.aborted, false);
  assert.equal(f.paints.length, 0);
  await f.resolve(0); f.images[0].onload();
  assert.deepEqual(f.paints, ["blob:0"]);
  f.loader.dispose();
});

test("사진 로딩 중 배치를 바꾸면 같은 요청을 유지하고 최신 배치로만 그린다", async () => {
  const f = fixture();
  f.loader.update("photo", "IMAGE", () => f.paints.push("old"));
  f.loader.update("photo", "IMAGE", () => f.paints.push("latest"));
  assert.equal(f.requests.length, 1);
  await f.resolve(0); f.images[0].onload();
  assert.deepEqual(f.paints, ["latest"]);
  f.loader.dispose();
});

test("사진이 먼저 도착하면 늦은 테두리와 최신 배치를 다운로드 없이 합성한다", async () => {
  const f = fixture();
  f.loader.update("photo", "IMAGE", () => f.paints.push("initial"));
  await f.resolve(0); f.images[0].onload();
  f.loader.update("photo", "IMAGE", () => f.paints.push("changed"));
  f.loader.repaint();
  assert.deepEqual(f.paints, ["initial", "changed", "changed"]);
  assert.equal(f.requests.length, 1);
  f.loader.dispose();
});

test("사진 자체를 바꾸면 이전 요청을 취소하고 늦게 도착한 주소를 해제한다", async () => {
  const f = fixture();
  f.loader.update("old", "OLD", () => f.paints.push("old"));
  const oldOnload = f.images[0].onload;
  f.loader.update("new", "NEW", () => f.paints.push("new"));
  assert.equal(f.requests[0].signal.aborted, true);
  await f.resolve(0); oldOnload();
  assert.deepEqual(f.disposed, [0]);
  assert.deepEqual(f.paints, []);
  await f.resolve(1); f.images[1].onload();
  assert.deepEqual(f.paints, ["new"]);
  f.loader.dispose();
  assert.deepEqual(f.disposed, [0, 1]);
});

test("사진 URL이 같아도 인증 텍스처 경로가 바뀌면 새 요청을 보낸다", () => {
  const f = fixture();
  f.loader.update("same", "FIRST", () => {});
  f.loader.update("same", "SECOND", () => {});
  assert.equal(f.requests.length, 2);
  assert.equal(f.requests[0].signal.aborted, true);
  f.loader.dispose();
});

test("2D 복귀·사진 제거는 지연 응답과 오류를 무시하며 중복 해제하지 않는다", async () => {
  const f = fixture();
  f.loader.update("photo", "IMAGE", () => f.paints.push("wrong"));
  f.loader.update(null, null, () => {});
  assert.equal(f.requests[0].signal.aborted, true);
  await f.resolve(0);
  f.loader.dispose(); f.loader.dispose(); f.loader.repaint();
  assert.deepEqual(f.disposed, [0]);
  assert.deepEqual(f.paints, []);
  assert.deepEqual(f.errors, []);
});

test("다운로드 실패는 오류를 알리고 같은 사진으로 재시도할 수 있다", async () => {
  const f = fixture();
  f.loader.update("photo", "IMAGE", () => {});
  f.requests[0].reject(new Error("fixture 403"));
  await new Promise(setImmediate);
  assert.deepEqual(f.errors, ["failed"]);
  f.loader.update("photo", "IMAGE", () => f.paints.push("retry"));
  await f.resolve(1); f.images[1].onload();
  assert.deepEqual(f.paints, ["retry"]);
  f.loader.dispose();
});

test("이미지 해석 실패는 준비 완료로 처리하지 않고 임시 주소를 해제한다", async () => {
  const f = fixture();
  f.loader.update("photo", "IMAGE", () => f.paints.push("wrong"));
  await f.resolve(0); f.images[0].naturalWidth = 0; f.images[0].onload();
  assert.deepEqual(f.errors, ["failed"]);
  assert.deepEqual(f.paints, []);
  assert.deepEqual(f.disposed, [0]);
  f.loader.dispose();
});
