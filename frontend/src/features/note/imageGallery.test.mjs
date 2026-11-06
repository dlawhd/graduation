import test from "node:test";
import assert from "node:assert/strict";
import { getNoteImages, nextImageIndex } from "./imageGallery.mjs";

test("확대창 사진 순서는 유지하고 영상·미지원 파일·원본 없는 사진은 제외한다", () => {
  const a = { url: "/a.png", contentType: "image/png" }, b = { url: "/b.webp", contentType: "image/webp" };
  assert.deepEqual(getNoteImages([a, { url: "/v.mp4", contentType: "video/mp4" }, null,
    { url: "/x", contentType: "application/pdf" }, { url: "/x", contentType: 123 }, { url: " ", contentType: "image/png" }, b]), [a, b]);
});
test("주소가 같아도 서로 다른 사진 설명과 순서를 유지한다", () => {
  const items = [{ url: "/a.png", contentType: "image/png", caption: "첫 장" }, { url: "/a.png", contentType: "image/png", caption: "다음 장" }];
  const photos = getNoteImages(items);
  assert.equal(photos.length, 2); assert.equal(photos.indexOf(items[1]), 1);
});
test("첨부가 없거나 잘못된 목록이면 빈 사진 목록이다", () => {
  for (const value of [undefined, null, {}, "images"]) assert.deepEqual(getNoteImages(value), []);
});
test("앞뒤 이동은 첫 장과 마지막 장에서 멈춘다", () => {
  assert.equal(nextImageIndex(0, -1, 3), 0);
  assert.equal(nextImageIndex(0, 1, 3), 1);
  assert.equal(nextImageIndex(2, 1, 3), 2);
  assert.equal(nextImageIndex(2, -1, 3), 1);
});
test("닫은 뒤 도착한 이동은 확대창을 다시 열지 않는다", () => {
  assert.equal(nextImageIndex(null, 1, 3), null);
  assert.equal(nextImageIndex(0, 1, 0), null);
});
test("한 장과 연속 입력에서도 범위를 벗어나지 않는다", () => {
  assert.equal(nextImageIndex(0, 1, 1), 0);
  let index = 0;
  for (let i = 0; i < 100; i++) index = nextImageIndex(index, 1, 4);
  assert.equal(index, 3);
  for (let i = 0; i < 100; i++) index = nextImageIndex(index, -1, 4);
  assert.equal(index, 0);
});
