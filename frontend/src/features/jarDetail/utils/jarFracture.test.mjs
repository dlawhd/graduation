import test from "node:test";
import assert from "node:assert/strict";
import { buildJarFracture, crackCutoutUrl } from "./jarFracture.mjs";
import { foregroundAlpha } from "./jarOpeningSilhouette.mjs";

test("조각은 겹침·빈 원형 없이 원본 전체 면적을 덮는다", () => {
  const model = buildJarFracture();
  const area = model.pieces.reduce((sum, piece) => sum + piece.points.reduce((part, p, i, points) => {
    const next = points[(i + 1) % points.length]; return part + (p.x * next.y - next.x * p.y) / 2;
  }, 0), 0);
  assert.equal(model.pieces.length, 12); assert.ok(Math.abs(area - 480 * 480) < .01);
  assert.equal(model.pieces.some(piece => piece.id === "center"), false);
});
test("모든 균열은 두 조각이 공유하는 바로 그 경계이다", () => {
  const model = buildJarFracture();
  for (const edge of model.cracks) {
    assert.equal(edge.owners.length, 2);
    for (const owner of edge.owners) {
      const points = model.pieces.find(piece => piece.id === owner).points;
      for (const p of edge.points.slice(1, -1)) assert.ok(points.some(q => Math.abs(p.x - q.x) < .0001 && Math.abs(p.y - q.y) < .0001));
    }
  }
});
test("첫 금은 실제 타격점에 연결되며 두 번째·세 번째에 영역이 늘어난다", () => {
  const contains = (x, y) => x > 160 && x < 320 && y > 60 && y < 260;
  const model = buildJarFracture({ contains });
  assert.equal(contains(model.impact.x, model.impact.y), true);
  for (const edge of model.cracks.filter(edge => edge.stage === 1)) assert.ok([edge.a, edge.b].some(p => p.x === model.impact.x && p.y === model.impact.y));
  const counts = [1, 2, 3].map(stage => model.cracks.filter(edge => edge.stage <= stage).length);
  assert.ok(counts[0] < counts[1] && counts[1] < counts[2]);
});
test("균열 투명 틈도 같은 선으로 생성되고 손상 전에는 원본을 유지한다", () => {
  const model = buildJarFracture(); assert.equal(crackCutoutUrl(model.cracks, 0), null);
  const svg = decodeURIComponent(crackCutoutUrl(model.cracks, 1).split(',')[1]);
  for (const edge of model.cracks.filter(edge => edge.stage === 1)) assert.ok(svg.includes(edge.path));
});
test("같은 입력의 분할은 항상 같고 조각 회전·낙하 값은 유한하다", () => {
  const first = buildJarFracture(); assert.deepEqual(first, buildJarFracture());
  assert.ok(first.pieces.every(piece => [piece.x, piece.y, piece.rotate].every(Number.isFinite)));
});

function pixels(width, height, color = [255, 255, 255, 255]) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) data.set(color, i * 4);
  return data;
}
test("흰 외곽 배경을 제외하면서 닫힌 눈·무늬 내부의 흰색은 남긴다", () => {
  const data = pixels(7, 7);
  for (let y = 2; y <= 4; y++) for (let x = 2; x <= 4; x++) if (x !== 3 || y !== 3) data.set([20, 20, 20, 255], (y * 7 + x) * 4);
  const alpha = foregroundAlpha(data, 7, 7);
  assert.equal(alpha[0], 0); assert.equal(alpha[3 * 7 + 3], 255); assert.equal(alpha[2 * 7 + 2], 255);
});
test("유색 사진 배경과 내부 흰 영역은 임의로 제거하지 않는다", () => {
  const data = pixels(7, 7, [50, 100, 180, 255]); data.set([255, 255, 255, 255], 0);
  assert.equal(foregroundAlpha(data, 7, 7)[0], 255);
});
test("잘못된 픽셀 크기는 거절하고 투명 배경은 투명하게 유지한다", () => {
  assert.throws(() => foregroundAlpha(new Uint8ClampedArray(3), 1, 1));
  assert.deepEqual([...foregroundAlpha(pixels(2, 2, [0, 0, 0, 0]), 2, 2)], [0, 0, 0, 0]);
});
