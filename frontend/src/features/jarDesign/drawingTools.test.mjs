import test from "node:test";
import assert from "node:assert/strict";
import { drawingPoint, drawShape, hasDrawingPixels } from "./drawingTools.mjs";

test("축소된 캔버스 좌표와 바깥 입력을 480px 원본에 매핑한다", () => {
  const rect = { left: 10, top: 20, width: 240, height: 240 };
  assert.deepEqual(drawingPoint(130, 140, rect, 480), { x: 240, y: 240 });
  assert.deepEqual(drawingPoint(-20, 600, rect, 480), { x: 0, y: 480 });
});

function recordingContext() {
  const calls = [];
  const ctx = Object.fromEntries(["beginPath", "moveTo", "lineTo", "rect", "ellipse", "closePath", "fill", "stroke"].map((name) => [name, (...args) => calls.push([name, ...args])]));
  return { ctx, calls };
}

test("역방향 드래그한 사각형에도 양수 크기와 채우기를 적용한다", () => {
  const { ctx, calls } = recordingContext();
  drawShape(ctx, "rectangle", { x: 80, y: 90 }, { x: 20, y: 30 }, true);
  assert.deepEqual(calls, [["beginPath"], ["rect", 20, 30, 60, 60], ["fill"], ["stroke"]]);
});

test("원은 역방향 및 크기 0에서도 음수 반지름을 만들지 않는다", () => {
  const { ctx, calls } = recordingContext();
  drawShape(ctx, "ellipse", { x: 80, y: 90 }, { x: 20, y: 30 }, false);
  assert.deepEqual(calls[1], ["ellipse", 50, 60, 30, 30, 0, 0, Math.PI * 2]);
  drawShape(ctx, "ellipse", { x: 0, y: 0 }, { x: 0, y: 0 }, false);
  assert.equal(calls.at(-2)[3], 0);
});

test("직선은 채우지 않고 삼각형은 닫힌 경로를 만든다", () => {
  const { ctx, calls } = recordingContext();
  drawShape(ctx, "line", { x: 0, y: 0 }, { x: 5, y: 5 }, true);
  assert.equal(calls.some(([name]) => name === "fill"), false);
  drawShape(ctx, "triangle", { x: 0, y: 0 }, { x: 10, y: 20 }, true);
  assert.deepEqual(calls.slice(-6), [["moveTo", 5, 0], ["lineTo", 10, 20], ["lineTo", 0, 20], ["closePath"], ["fill"], ["stroke"]]);
});

test("흰색·투명 픽셀은 빈 그림이며 작은 유색 영역은 보존한다", () => {
  assert.equal(hasDrawingPixels([255, 255, 255, 255, 0, 0, 0, 0]), false);
  assert.equal(hasDrawingPixels([255, 255, 255, 255, 255, 0, 0, 255]), true);
});
