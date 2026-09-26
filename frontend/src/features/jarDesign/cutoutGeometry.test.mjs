import test from "node:test";
import assert from "node:assert/strict";
import {
  CUTOUT_MAX_REGIONS,
  cutoutPointAtPointer,
  normalizeCutoutPoints,
  normalizeCutoutRegions,
  sameCutoutRegions,
  sameCutoutPoints,
  shouldAppendCutoutPoint,
  toCutoutClipPath,
  toCutoutMaskStyle,
} from "./cutoutGeometry.mjs";

test("외곽선 좌표는 0~1과 소수점 다섯째 자리로 정규화한다", () => {
  assert.deepEqual(normalizeCutoutPoints([{ x: -1, y: 0.1234567 }, { x: 2, y: 1 }]), [
    { x: 0, y: 0.12346 },
    { x: 1, y: 1 },
  ]);
});

test("세 점 이상일 때만 이미지 영역을 자르는 polygon을 만든다", () => {
  assert.equal(toCutoutClipPath([{ x: 0, y: 0 }, { x: 1, y: 0 }]), undefined);
  assert.equal(toCutoutClipPath([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0.5, y: 1 }]),
    "polygon(0% 0%, 100% 0%, 50% 100%)");
});

test("드래그 좌표와 샘플 간격을 이미지 크기에 무관하게 계산한다", () => {
  const bounds = { left: 100, top: 50, width: 400, height: 200 };
  const point = cutoutPointAtPointer(300, 150, bounds);
  assert.deepEqual(point, { x: 0.5, y: 0.5 });
  assert.equal(shouldAppendCutoutPoint([{ x: 0.5, y: 0.5 }], { x: 0.501, y: 0.501 }), false);
  assert.equal(shouldAppendCutoutPoint([{ x: 0.5, y: 0.5 }], { x: 0.52, y: 0.5 }), true);
  assert.equal(sameCutoutPoints([{ x: 0.5, y: 0.5 }], [{ x: 0.5000001, y: 0.5 }]), true);
});

test("기존 단일 외곽선과 새 다중 영역을 같은 regions 계약으로 정규화한다", () => {
  const first = [{ x: 0.1, y: 0.1 }, { x: 0.3, y: 0.1 }, { x: 0.2, y: 0.3 }];
  const second = [{ x: 0.7, y: 0.7 }, { x: 0.9, y: 0.7 }, { x: 0.8, y: 0.9 }];
  assert.deepEqual(normalizeCutoutRegions(first), [first]);
  assert.deepEqual(normalizeCutoutRegions([first, second]), [first, second]);
  assert.equal(sameCutoutRegions([first, second], [first, second]), true);
});

test("최대 30개의 분리된 선택 영역을 유지한다", () => {
  const triangle = [{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.1 }, { x: 0.15, y: 0.2 }];
  const regions = Array.from({ length: CUTOUT_MAX_REGIONS }, () => triangle);

  assert.equal(CUTOUT_MAX_REGIONS, 30);
  assert.equal(normalizeCutoutRegions(regions).length, 30);
});

test("떨어진 여러 영역을 한 이미지에 합치는 SVG 마스크를 만든다", () => {
  const regions = [
    [{ x: 0.1, y: 0.1 }, { x: 0.3, y: 0.1 }, { x: 0.2, y: 0.3 }],
    [{ x: 0.7, y: 0.7 }, { x: 0.9, y: 0.7 }, { x: 0.8, y: 0.9 }],
  ];
  const style = toCutoutMaskStyle(regions);
  assert.match(style.maskImage, /data:image\/svg\+xml/);
  assert.equal((decodeURIComponent(style.maskImage).match(/<polygon/g) || []).length, 2);
});
