import test from "node:test";
import assert from "node:assert/strict";
import { drawingPoint, drawShape, hasDrawingPixels, SHAPES, BRUSHES, BODY_BRUSHES, constrainShape, drawBrushStroke, floodFill, sampledColor } from "./drawingTools.mjs";
import { CHARACTER_SHAPES, drawCharacterShape } from "./characterShapes.mjs";

test("축소된 캔버스 좌표와 바깥 입력을 480px 원본에 매핑한다", () => {
  const rect = { left: 10, top: 20, width: 240, height: 240 };
  assert.deepEqual(drawingPoint(130, 140, rect, 480), { x: 240, y: 240 });
  assert.deepEqual(drawingPoint(-20, 600, rect, 480), { x: 0, y: 480 });
});

function recordingContext() {
  const calls = [];
  const ctx = Object.fromEntries(["beginPath", "moveTo", "lineTo", "rect", "ellipse", "closePath", "fill", "stroke", "arcTo", "bezierCurveTo", "save", "restore", "arc", "fillRect"].map((name) => [name, (...args) => calls.push([name, ...args])]));
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

test("18종 도형은 역방향과 크기 0에서도 유효한 Canvas 경로를 만든다", () => {
  assert.equal(SHAPES.length, 18);
  for (const [shape] of SHAPES) for (const end of [{ x: 20, y: 30 }, { x: 90, y: 90 }]) {
    const { ctx, calls } = recordingContext();
    drawShape(ctx, shape, { x: 90, y: 90 }, end, true);
    assert.equal(calls.at(-1)[0], "stroke", shape);
    assert.ok(calls.length > 2, shape);
    assert.ok(calls.flatMap((call) => call.slice(1)).every(Number.isFinite), shape);
  }
});

test("Shift 보정은 정사각 비율을 유지하면서 캔버스 경계를 넘지 않는다", () => {
  assert.deepEqual(constrainShape({ x: 460, y: 100 }, { x: 470, y: 300 }), { x: 480, y: 120 });
  assert.deepEqual(constrainShape({ x: 100, y: 100 }, { x: 70, y: 50 }), { x: 50, y: 50 });
});

test("10종 펜은 클릭과 긴 획을 그리고 투명도 설정을 격리한다", () => {
  assert.equal(BRUSHES.length, 10);
  for (const [brush] of BRUSHES) for (const points of [[{ x: 10, y: 20 }], [{ x: 10, y: 20 }, { x: 100, y: 200 }]]) {
    const { ctx, calls } = recordingContext();
    drawBrushStroke(ctx, points, { brush, color: "#ef4444", size: 12, opacity: .5 });
    assert.equal(calls[0][0], "save"); assert.equal(calls.at(-1)[0], "restore");
    assert.ok(calls.some(([name]) => ["fill", "fillRect", "stroke"].includes(name)));
    assert.ok(ctx.globalAlpha > 0 && ctx.globalAlpha <= .5);
  }
});

test("12종 캐릭터는 역방향과 크기 0에서도 닫힌 유한 경로를 만든다", () => {
  assert.equal(CHARACTER_SHAPES.length, 12);
  assert.equal(new Set(CHARACTER_SHAPES.map(([id]) => id)).size, 12);
  for (const [shape] of CHARACTER_SHAPES) for (const end of [{ x: 20, y: 30 }, { x: 90, y: 90 }]) {
    const { ctx, calls } = recordingContext();
    drawShape(ctx, shape, { x: 90, y: 90 }, end, true);
    assert.ok(calls.some(([name]) => name === "bezierCurveTo"), shape);
    assert.deepEqual(calls.slice(-3), [["closePath"], ["fill"], ["stroke"]], shape);
    for (const [, ...coords] of calls) coords.forEach((n, i) => {
      assert.ok(Number.isFinite(n) && n >= (i % 2 ? end.y : end.x) && n <= 90, shape);
    });
  }
});

test("미등록 캐릭터와 객체 내장 이름은 그림 경로로 사용하지 않는다", () => {
  const { ctx, calls } = recordingContext();
  for (const id of ["unknown", "__proto__", "toString", "constructor"]) {
    assert.equal(drawCharacterShape(ctx, id, 0, 0, 100, 100), false);
  }
  assert.deepEqual(calls, []);
});

test("틀용 펜 8종은 불투명한 연결 획이며 분리 입자 펜은 제외한다", () => {
  assert.equal(BODY_BRUSHES.length, 8);
  assert.ok(BODY_BRUSHES.every(([id]) => !["crayon", "spray"].includes(id)));
  for (const [brush] of BODY_BRUSHES) {
    const { ctx, calls } = recordingContext(), alphas = [];
    Object.defineProperty(ctx, "globalAlpha", { set: value => alphas.push(value) });
    drawBrushStroke(ctx, [{ x: 10, y: 20 }, { x: 100, y: 200 }], { brush, color: "#123456", size: 20, silhouette: true });
    assert.ok(alphas.every(alpha => alpha === 1), brush);
    assert.ok(calls.some(([name]) => ["stroke", "fill"].includes(name)), brush);
  }
});

test("몽글 펜의 장식 간격은 같은 경로의 포인터 분할과 무관하다", () => {
  const arcs = points => {
    const { ctx, calls } = recordingContext();
    drawBrushStroke(ctx, points, { brush: "scallop", color: "#123456", size: 10 });
    return calls.filter(([name]) => name === "arc");
  };
  assert.deepEqual(arcs([{ x: 0, y: 0 }, { x: 65, y: 0 }]), arcs([{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 65, y: 0 }]));
});

test("새 펜은 빈 획을 무시하고 몽글 펜의 장식 개수를 제한한다", () => {
  const { ctx, calls } = recordingContext();
  drawBrushStroke(ctx, [], { brush: "ribbon", color: "#123456", size: 20 });
  assert.equal(calls.length, 0);
  drawBrushStroke(ctx, [{ x: 0, y: 0 }, { x: 1e6, y: 0 }], { brush: "scallop", color: "#123456", size: 1 });
  assert.equal(calls.filter(([name]) => name === "arc").length, 4096);
});

test("채우기는 경계로 분리된 영역만 변경하고 이미 같은 색이면 이력을 늘리지 않는다", () => {
  const image = { width: 3, height: 3, data: new Uint8ClampedArray(36).fill(255) };
  for (const offset of [4, 16, 28]) image.data.set([0, 0, 0, 255], offset);
  assert.equal(floodFill(image, 0, 1, "#ff0000"), true);
  assert.deepEqual([...image.data.slice(0, 12)], [255, 0, 0, 255, 0, 0, 0, 255, 255, 255, 255, 255]);
  assert.equal(floodFill(image, 0, 0, "#ff0000"), false);
});

test("전체 480px 채우기는 재귀 없이 끝나며 바깥 좌표도 안전하게 보정한다", () => {
  const image = { width: 480, height: 480, data: new Uint8ClampedArray(480 * 480 * 4).fill(255) };
  assert.equal(floodFill(image, 480, -1, "#123456"), true);
  assert.deepEqual([...image.data.slice(-4)], [18, 52, 86, 255]);
  const ctx = { getImageData(x, y) { assert.equal(x, 479); assert.equal(y, 479); return { data: [18, 52, 86, 255] }; } };
  assert.equal(sampledColor(ctx, { x: 480, y: 480 }), "#123456");
});
