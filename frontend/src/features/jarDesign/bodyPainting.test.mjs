import test from "node:test";
import assert from "node:assert/strict";
import { fillPaintedBody, paintedBodyOutline } from "./bodyPainting.mjs";
import { basicBodyOutline, customJarBody, MAX_BODY_POINTS, outlineError } from "./customJarBody.mjs";
import { floodFill } from "./drawingTools.mjs";

/** 브라우저 의존성 없이 실제 480px 픽셀 마스크와 좌표 저장 규칙을 대조한다. */
function painting(inside, color = [215, 233, 223, 255], size = 480) {
  const image = { width: size, height: size, data: new Uint8ClampedArray(size * size * 4) };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++)
    if (inside(x, y)) image.data.set(color, (y * size + x) * 4);
  return image;
}
const rectangle = (x, y) => x >= 100 && x < 380 && y >= 100 && y < 380;
function assertValid(result) {
  assert.equal(result.error, ""); assert.equal(outlineError(result.value), "");
  assert.ok(result.value.points.length <= MAX_BODY_POINTS); assert.ok(customJarBody(result.value));
}
function insidePolygon(x, y, points) {
  let result = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i], b = points[j];
    if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) result = !result;
  }
  return result;
}

test("색칠한 사각형을 4개 좌표로 저장하며 원본 픽셀을 변경하지 않는다", () => {
  const image = painting(rectangle), before = image.data.slice(), result = paintedBodyOutline(image);
  assertValid(result); assert.equal(result.value.points.length, 4); assert.equal(result.value.color, "#d7e9df");
  assert.deepEqual(image.data, before);
});

test("흰색 틀은 빈 그림이 아니다. 투명 배경과 구분해 저장한다", () => {
  const result = paintedBodyOutline(painting(rectangle, [255, 255, 255, 255]));
  assertValid(result); assert.equal(result.value.color, "#ffffff");
});

test("원형의 계단식 픽셀 경계는 최대 96점의 유효한 외곽선이 된다", () => {
  assertValid(paintedBodyOutline(painting((x, y) => ((x - 240) / 170) ** 2 + ((y - 240) / 185) ** 2 <= 1)));
});

test("모든 기본 틀을 칠하고 다시 읽어도 색과 모양 범위를 유지한다", () => {
  for (const kind of ["ROUND", "JAR", "SQUARE"]) {
    const basic = basicBodyOutline(kind, "#123456");
    const result = paintedBodyOutline(painting((x, y) => insidePolygon((x + .5) / 480, (y + .5) / 480, basic.points), [18, 52, 86, 255]));
    assertValid(result); assert.equal(result.value.color, "#123456");
    for (const axis of ["x", "y"]) for (const bound of [Math.min, Math.max])
      assert.ok(Math.abs(bound(...result.value.points.map(p => p[axis])) - bound(...basic.points.map(p => p[axis]))) < 3 / 480);
  }
});

test("겹쳐 그린 도형과 오목한 외형은 하나로 저장한다", () => {
  assertValid(paintedBodyOutline(painting((x, y) => rectangle(x, y) || (x >= 180 && x < 300 && y >= 50 && y < 110))));
  assertValid(paintedBodyOutline(painting((x, y) => rectangle(x, y) && !(x >= 180 && x < 300 && y >= 200))));
});

test("분리된 조각을 임의로 삭제하지 않고 다음 단계 진행을 차단한다", () => {
  const result = paintedBodyOutline(painting((x, y) => rectangle(x, y) || (x >= 30 && x < 50 && y >= 30 && y < 50)));
  assert.match(result.error, /떨어진 조각/); assert.deepEqual(result.value.points, []);
});

test("지우개로 생긴 내부 구멍은 안내하며 기존 채우기로 메우면 저장된다", () => {
  const image = painting((x, y) => rectangle(x, y) && !(x >= 200 && x < 280 && y >= 200 && y < 280));
  assert.match(paintedBodyOutline(image).error, /채우기로/);
  assert.equal(floodFill(image, 240, 240, "#d7e9df"), true);
  assertValid(paintedBodyOutline(image));
});

test("틀 채우기는 반투명 RGB 가장자리까지 메우되 원래 칠한 영역은 보존한다", () => {
  const image = painting((x, y) => rectangle(x, y) && !(x >= 200 && x < 280 && y >= 200 && y < 280));
  for (let y = 200; y < 280; y++) for (let x = 200; x < 280; x++)
    if (x === 200 || x === 279 || y === 200 || y === 279) image.data.set([215, 233, 223, 30], (y * 480 + x) * 4);
  assert.equal(fillPaintedBody(image, 240, 240, "#d7e9df"), true); assertValid(paintedBodyOutline(image));
  assert.deepEqual([...image.data.slice((200 * 480 + 200) * 4, (200 * 480 + 200) * 4 + 4)], [215, 233, 223, 255]);
  assert.deepEqual([...image.data.slice(0, 4)], [0, 0, 0, 0]);
  const before = image.data.slice(); assert.equal(fillPaintedBody(image, 240, 240, "#d7e9df"), false); assert.deepEqual(image.data, before);
});

test("빈 화면과 아주 작은 획은 이전 유효한 틀 대신 빈 좌표와 안내를 반환한다", () => {
  assert.match(paintedBodyOutline(painting(() => false)).error, /펜이나 도형/);
  const result = paintedBodyOutline(painting((x, y) => x >= 200 && x < 220 && y >= 200 && y < 220));
  assert.match(result.error, /넓게/); assert.deepEqual(result.value.points, []);
});

test("전체 채우기는 저장 가능한 5% 작업 여백을 지킨다", () => {
  const result = paintedBodyOutline(painting(() => true)); assertValid(result);
  assert.deepEqual(result.value.points, [{ x: .05, y: .05 }, { x: .95, y: .05 }, { x: .95, y: .95 }, { x: .05, y: .95 }]);
});

test("희미한 가장자리 픽셀은 조각으로 오인하지 않는다", () => {
  const image = painting(rectangle); image.data.set([215, 233, 223, 47], (50 * 480 + 50) * 4);
  assertValid(paintedBodyOutline(image));
});

test("안티앨리어싱 가장자리의 반올림 색 대신 안쪽의 원래 팔레트 색을 사용한다", () => {
  const image = painting(rectangle);
  image.data.set([218, 232, 223, 60], (100 * 480 + 100) * 4);
  assert.equal(paintedBodyOutline(image).value.color, "#d7e9df");
});

test("잘못된 픽셀 길이와 과도한 이미지 크기는 계산 전에 거절한다", () => {
  for (const image of [null, {}, { width: 480, height: 480, data: [] }, { width: 481, height: 480, data: [] }, { width: NaN, height: 480 }])
    assert.match(paintedBodyOutline(image).error, /읽지 못/);
});
