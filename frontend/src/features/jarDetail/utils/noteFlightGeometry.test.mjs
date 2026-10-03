import test from "node:test";
import assert from "node:assert/strict";
import { createNoteFlight, measureJarDropTarget, NOTE_FLIGHT_HEIGHT, NOTE_FLIGHT_WIDTH } from "./noteFlightGeometry.mjs";

const jarWithSlot = (rect) => ({
  querySelector(selector) {
    assert.equal(selector, "[data-jar-slot-target]");
    return { getBoundingClientRect: () => rect };
  },
  getBoundingClientRect() { throw new Error("옛 저금통 컨테이너 좌표를 사용하면 안 된다."); },
});

test("저장한 입구가 좌우·위아래 어디에 있어도 실제 입구 중심을 측정한다", () => {
  for (const rect of [
    { left: 105, top: 230, width: 45, height: 12 },
    { left: 780, top: 96, width: 65, height: 19 },
    { left: 26, top: -110, width: 28, height: 8 },
  ]) {
    assert.deepEqual(measureJarDropTarget(jarWithSlot(rect)), {
      x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, width: rect.width, height: rect.height,
    });
  }
});

test("기본 저금통도 고정 top+86 대신 실제 뚜껑 입구를 사용한다", () => {
  assert.deepEqual(measureJarDropTarget(jarWithSlot({ left: 202, top: 160, width: 56, height: 8 })),
    { x: 230, y: 164, width: 56, height: 8 });
});

test("이미지 실패·아직 없는 입구·숨겨진 입구는 옛 좌표로 대체하지 않는다", () => {
  assert.equal(measureJarDropTarget(null), null);
  assert.equal(measureJarDropTarget({ querySelector: () => null }), null);
  for (const rect of [
    { left: 1, top: 2, width: 0, height: 0 },
    { left: 1, top: 2, width: 40, height: 0 },
    { left: NaN, top: 2, width: 40, height: 12 },
  ]) assert.equal(measureJarDropTarget(jarWithSlot(rect)), null);
});

test("PC·모바일·스크롤 좌표에서 마지막 쪽지 중심이 입구 중심과 일치한다", () => {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    for (const target of [{ x: 330, y: 210 }, { x: 122, y: 690 }, { x: 90, y: -80 }]) {
      const flight = createNoteFlight(target, viewport);
      assert.equal(flight.startX + NOTE_FLIGHT_WIDTH / 2 + flight.deltaX, target.x);
      assert.equal(flight.startY + NOTE_FLIGHT_HEIGHT / 2 + flight.deltaY, target.y);
    }
  }
});

test("좁은 입구와 크기 변경에도 마지막 쪽지가 입구 안에 들어갈 만큼 줄어든다", () => {
  for (const target of [{ x: 100, y: 300, width: 56, height: 8 }, { x: 210, y: 400, width: 28, height: 8 },
    { x: 240, y: 500, width: 100, height: 30 }]) {
    const { endScale } = createNoteFlight(target, { width: 390, height: 844 });
    assert.ok(endScale > 0 && endScale <= 0.16);
    // 최종 회전 18도를 포함한 표시 영역도 실제 입구보다 작아야 한다.
    const angle = 18 * Math.PI / 180;
    assert.ok((NOTE_FLIGHT_WIDTH * Math.cos(angle) + NOTE_FLIGHT_HEIGHT * Math.sin(angle)) * endScale < target.width);
    assert.ok((NOTE_FLIGHT_HEIGHT * Math.cos(angle) + NOTE_FLIGHT_WIDTH * Math.sin(angle)) * endScale < target.height);
  }
});

test("유효하지 않은 목표와 뷰포트에서는 애니메이션을 시작하지 않는다", () => {
  for (const [target, viewport] of [[null, { width: 390, height: 844 }], [{ x: NaN, y: 4 }, { width: 390, height: 844 }],
    [{ x: 1, y: 2 }, { width: 0, height: 844 }], [{ x: 1, y: 2 }, null]]) {
    assert.equal(createNoteFlight(target, viewport), null);
  }
});
