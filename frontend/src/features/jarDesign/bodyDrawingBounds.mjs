/** 틀 그림판과 외곽선 계산이 같은 1% 여백을 사용한다. 픽셀 경계는 안쪽 정수로 맞춘다. */
export const BODY_MARGIN = 0.01;
export const BODY_COORD_MAX = 1 - BODY_MARGIN;
export function bodyRasterBounds(width, height = width) {
  return { left: Math.ceil(width * BODY_MARGIN), top: Math.ceil(height * BODY_MARGIN),
    right: Math.floor(width * BODY_COORD_MAX), bottom: Math.floor(height * BODY_COORD_MAX) };
}
