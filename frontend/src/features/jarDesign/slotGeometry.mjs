/** 정사각형 원본·AI·PIXEL 이미지에 공통으로 쓰는 슬롯 렌더링 계약이다. */
export const SLOT_MIN_WIDTH = 0.12;
export const SLOT_WIDTH_RANGE = 0.16;
export const SLOT_ASPECT_RATIO = 3.5;
export const DEFAULT_SLOT = { centerX: 0.5, centerY: 0.5, sizeRatio: 0.5 };

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const round = (value) => Number(value.toFixed(5));

/** sizeRatio는 슬라이더 위치이며, 실제 이미지 너비의 12~28%로 변환한다. */
export function slotDimensions(sizeRatio) {
  const width = SLOT_MIN_WIDTH + SLOT_WIDTH_RANGE * sizeRatio;
  return { width, height: width / SLOT_ASPECT_RATIO };
}

/** DB 소수점 다섯 자리로 양자화한 뒤에도 슬롯이 경계 밖으로 나가지 않도록 안쪽으로 보정한다. */
export function normalizeSlot(slot) {
  const sizeRatio = round(clamp(slot.sizeRatio, 0, 1));
  // 정수 분수로 계산해 0.14가 부동소수 오차로 0.14001로 밀리지 않게 한다.
  const widthNumerator = 1200000 + 16 * Math.round(sizeRatio * 100000);
  const minX = Math.ceil(widthNumerator / 200) / 100000;
  const minY = Math.ceil(widthNumerator / 700) / 100000;
  return {
    centerX: round(clamp(slot.centerX, minX, 1 - minX)),
    centerY: round(clamp(slot.centerY, minY, 1 - minY)),
    sizeRatio,
  };
}

/** 화면의 위치·크기에 무관하게 실제 정사각형 이미지 영역을 기준으로 좌표를 계산한다. */
export function slotAtPointer(slot, clientX, clientY, bounds) {
  if (bounds.width <= 0 || bounds.height <= 0) return slot;
  return normalizeSlot({
    ...slot,
    centerX: (clientX - bounds.left) / bounds.width,
    centerY: (clientY - bounds.top) / bounds.height,
  });
}

export function sameSlot(first, second) {
  return Boolean(first && second && first.centerX === second.centerX
    && first.centerY === second.centerY && first.sizeRatio === second.sizeRatio);
}

/** 미저장 Draft의 NULL을 숫자 0으로 잘못 복원하지 않는다. */
export function storedSlot(draft) {
  const values = [draft.slotCenterX, draft.slotCenterY, draft.slotSizeRatio];
  if (values.some((value) => value == null || !Number.isFinite(Number(value)))) return null;
  return { centerX: Number(values[0]), centerY: Number(values[1]), sizeRatio: Number(values[2]) };
}
