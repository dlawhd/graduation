/** 실제 화면의 입구와 쪽지 애니메이션이 같은 뷰포트 좌표를 사용하도록 계산한다. */
export const NOTE_FLIGHT_WIDTH = 76;
export const NOTE_FLIGHT_HEIGHT = 92;
export const NOTE_FLIGHT_DURATION = 920;

/** 저장된 커스텀 입구 또는 기본 저금통의 실제 입구를 찾는다. 없으면 임의의 옛 좌표로 보내지 않는다. */
export function measureJarDropTarget(jarElement) {
  // 커스텀 저금통은 본체마다 입구 위치가 달라 실제 저장된 슬롯의 화면 좌표를 사용한다.
  const slotElement = jarElement?.querySelector("[data-jar-slot-target]");
  if (!slotElement) return null;

  const { left, top, width, height } = slotElement.getBoundingClientRect();
  if (![left, top, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return null;

  return { x: left + width / 2, y: top + height / 2, width, height };
}

/** 화면 가운데에서 입구 중심으로 이동하고 마지막에는 입구 안에 들어갈 크기로 줄인다. */
export function createNoteFlight(target, viewport) {
  if (!target || ![target.x, target.y, viewport?.width, viewport?.height].every(Number.isFinite)
    || viewport.width <= 0 || viewport.height <= 0) return null;

  // 모달이 화면 가운데에서 열리니까 시작점도 화면 가운데로 잡아줘
  const startX = (viewport.width - NOTE_FLIGHT_WIDTH) / 2;
  const startY = (viewport.height - NOTE_FLIGHT_HEIGHT) / 2;
  const endScale = target.width > 0 && target.height > 0
    ? Math.min(0.16, target.width * 0.7 / NOTE_FLIGHT_WIDTH, target.height * 0.7 / NOTE_FLIGHT_HEIGHT)
    : 0.16;

  return {
    startX,
    startY,
    deltaX: target.x - viewport.width / 2,
    deltaY: target.y - viewport.height / 2,
    endScale,
  };
}
