import assert from "node:assert/strict";
import test from "node:test";
import {
  createPreviewImageKey,
  resolvePreviewImageState,
} from "./previewImageState.mjs";

test("현재 이미지의 onLoad 결과가 있으면 새로고침 없이 ready를 유지한다", () => {
  const imageKey = createPreviewImageKey("AI:10", "https://signed.test/image", 0);

  assert.equal(resolvePreviewImageState({
    isCustom: true,
    imageUrl: "https://signed.test/image",
    imageKey,
    loadedImageKey: imageKey,
    failedImageKey: "",
  }), "ready");
});

test("이전 후보의 load 결과는 새 후보를 ready로 잘못 처리하지 않는다", () => {
  const oldKey = createPreviewImageKey("AI:10", "https://signed.test/old", 0);
  const nextKey = createPreviewImageKey("AI:11", "https://signed.test/new", 0);

  assert.equal(resolvePreviewImageState({
    isCustom: true,
    imageUrl: "https://signed.test/new",
    imageKey: nextKey,
    loadedImageKey: oldKey,
    failedImageKey: "",
  }), "loading");
});

test("같은 Presigned URL도 재시도 횟수가 다르면 img를 다시 로드한다", () => {
  const firstKey = createPreviewImageKey("ORIGINAL:", "https://signed.test/same", 0);
  const retryKey = createPreviewImageKey("ORIGINAL:", "https://signed.test/same", 1);

  assert.notEqual(firstKey, retryKey);
  assert.equal(resolvePreviewImageState({
    isCustom: true,
    imageUrl: "https://signed.test/same",
    imageKey: retryKey,
    loadedImageKey: firstKey,
    failedImageKey: "",
  }), "loading");
});

test("URL 없음과 현재 URL 실패를 구분한다", () => {
  assert.equal(resolvePreviewImageState({
    isCustom: true,
    imageUrl: "",
    imageKey: "AI:10::0",
    loadedImageKey: "",
    failedImageKey: "",
  }), "missing");

  const failedKey = createPreviewImageKey("AI:10", "https://signed.test/image", 0);
  assert.equal(resolvePreviewImageState({
    isCustom: true,
    imageUrl: "https://signed.test/image",
    imageKey: failedKey,
    loadedImageKey: "",
    failedImageKey: failedKey,
  }), "failed");
});
