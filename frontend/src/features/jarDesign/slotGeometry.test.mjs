import test from "node:test";
import assert from "node:assert/strict";
import { normalizeSlot, slotDimensions, slotAtPointer, storedSlot, sameSlot } from "./slotGeometry.mjs";

test("480px 원본과 1024px AI에서 너비 12~28%, 높이 1/3.5 비율 유지", () => {
  for (const imageWidth of [320, 480, 1024]) {
    for (const [ratio, expectedWidth] of [[0, 0.12], [0.5, 0.20], [1, 0.28]]) {
      const dimensions = slotDimensions(ratio);
      assert.ok(Math.abs(dimensions.width * imageWidth - expectedWidth * imageWidth) < 1e-9);
      assert.ok(Math.abs(dimensions.width / dimensions.height - 3.5) < 1e-9);
    }
  }
});

test("모든 슬라이더 크기에서 네 모서리 보정 후 소수 다섯 자리 저장도 경계 안", () => {
  for (let step = 0; step <= 100; step++) {
    for (const x of [-10, 0, 1, 10]) for (const y of [-10, 0, 1, 10]) {
      const slot = normalizeSlot({ centerX: x, centerY: y, sizeRatio: step / 100 });
      const { width, height } = slotDimensions(slot.sizeRatio);
      assert.ok(slot.centerX - width / 2 >= -1e-12);
      assert.ok(slot.centerX + width / 2 <= 1 + 1e-12);
      assert.ok(slot.centerY - height / 2 >= -1e-12);
      assert.ok(slot.centerY + height / 2 <= 1 + 1e-12);
      for (const value of Object.values(slot)) assert.equal(value, Number(value.toFixed(5)));
    }
  }
});

test("가장자리에서 크기를 키워도 위치를 안쪽으로 다시 보정", () => {
  assert.deepEqual(normalizeSlot({ centerX: 0.06, centerY: 0.02, sizeRatio: 1 }),
    { centerX: 0.14, centerY: 0.04, sizeRatio: 1 });
});

test("스크롤·모바일 크기에 무관하게 실제 이미지 rect 기준으로 좌표 산출", () => {
  const slot = { centerX: 0.5, centerY: 0.5, sizeRatio: 0.5 };
  for (const size of [280, 480, 1024]) {
    assert.deepEqual(slotAtPointer(slot, 40 + size * 0.25, 120 + size * 0.75,
      { left: 40, top: 120, width: size, height: size }),
    { centerX: 0.25, centerY: 0.75, sizeRatio: 0.5 });
  }
  assert.deepEqual(slotAtPointer(slot, 0, 0, { width: 0, height: 0 }), slot);
});

test("미저장 NULL과 저장된 0 크기를 구분하고 새로고침 값을 복원", () => {
  assert.equal(storedSlot({ slotCenterX: null, slotCenterY: null, slotSizeRatio: null }), null);
  const restored = storedSlot({ slotCenterX: "0.5", slotCenterY: 0.4, slotSizeRatio: 0 });
  assert.deepEqual(restored, { centerX: 0.5, centerY: 0.4, sizeRatio: 0 });
  assert.equal(sameSlot(restored, normalizeSlot(restored)), true);
  assert.equal(sameSlot(restored, { ...restored, centerX: 0.6 }), false);
});
