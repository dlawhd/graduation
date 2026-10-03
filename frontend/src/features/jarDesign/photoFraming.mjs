// 사진 창의 가로세로 비율을 지키며 원본 안의 표시 영역만 바꾼다. 원본·AI 입력 자체는 잘라내지 않는다.
export const WHOLE_PHOTO = Object.freeze({ x: 0, y: 0, width: 1, height: 1 });
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const round = (n) => Math.round(n * 1e6) / 1e6;

export function validPhotoFrame(frame) {
  return Boolean(frame && [frame.x, frame.y, frame.width, frame.height].every(Number.isFinite)
    && frame.x >= 0 && frame.y >= 0 && frame.width >= .000001 && frame.height >= .000001
    && frame.x + frame.width <= 1.000001 && frame.y + frame.height <= 1.000001);
}

/** FILL 기본값: 사진 여백을 제외한 원본 영역 안에서 사진 창과 같은 비율의 가장 큰 영역을 선택한다. */
export function coverPhotoFrame(window, source = WHOLE_PHOTO, zoom = 1, positionX = .5, positionY = .5) {
  const bounds = validPhotoFrame(source) ? source : WHOLE_PHOTO;
  const ratio = window.width / window.height;
  const width = Math.min(bounds.width, bounds.height * ratio) / clamp(zoom, 1, 4);
  const height = width / ratio;
  return normalizePhotoFrame({ x: bounds.x + (bounds.width - width) * clamp(positionX, 0, 1),
    y: bounds.y + (bounds.height - height) * clamp(positionY, 0, 1), width, height }, bounds);
}

export function normalizePhotoFrame(frame, source = WHOLE_PHOTO) {
  const bounds = validPhotoFrame(source) ? source : WHOLE_PHOTO;
  const width = round(clamp(frame.width, .000001, bounds.width));
  const height = round(clamp(frame.height, .000001, bounds.height));
  return { x: round(clamp(frame.x, bounds.x, Math.max(bounds.x, Math.min(1-width, bounds.x+bounds.width-width)))),
    y: round(clamp(frame.y, bounds.y, Math.max(bounds.y, Math.min(1-height, bounds.y+bounds.height-height)))), width, height };
}

export function photoFrameStyle(frame) {
  if (!validPhotoFrame(frame)) return null;
  return { position: "absolute", maxWidth: "none", width: `${round(100/frame.width)}%`, height: `${round(100/frame.height)}%`,
    left: `${round(-frame.x/frame.width*100)}%`, top: `${round(-frame.y/frame.height*100)}%`, objectFit: "fill" };
}

export function samePhotoFrame(a, b) {
  return a === b || Boolean(a && b && ["x","y","width","height"].every((key) => Math.abs(a[key]-b[key]) < .0000005));
}

/** 저장한 배치를 슬라이더로 복원할 때 DB 소수점 반올림 때문에 불필요한 '수정됨'이 생기지 않게 한다. */
export function photoFrameControls(frame, window, source = WHOLE_PHOTO) {
  const baseWidth = Math.min(source.width, source.height * window.width/window.height);
  return { zoom: clamp(baseWidth/frame.width, 1, 4),
    x: source.width-frame.width > .000001 ? clamp((frame.x-source.x)/(source.width-frame.width), 0, 1) : .5,
    y: source.height-frame.height > .000001 ? clamp((frame.y-source.y)/(source.height-frame.height), 0, 1) : .5 };
}
