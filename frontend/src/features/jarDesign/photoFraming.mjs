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

/** 전체 보기는 실제 사진 영역을 창 안에 등비 축소한다. 흰색 정규화 띠는 사진 영역에 포함하지 않는다. */
export function containPhotoFrame(source = WHOLE_PHOTO) {
  return { ...(validPhotoFrame(source) ? source : WHOLE_PHOTO), fit: "CONTAIN" };
}

export function photoFrameStyle(frame, window) {
  if (!validPhotoFrame(frame)) return null;
  // COVER는 기존 공식 그대로다. CONTAIN만 전체 선택 영역의 비율을 유지하며 가운데에 놓는다.
  const ratio = window?.width / window?.height;
  const fit = frame.fit === "CONTAIN" && Number.isFinite(ratio) && ratio > 0;
  let width = fit ? Math.min(1, frame.width/frame.height/ratio) : 1;
  let height = fit ? Math.min(1, ratio/(frame.width/frame.height)) : 1;
  // 둥근 창의 네 귀퉁이에 사진 모서리가 잘리지 않도록 가장 큰 안전한 사각형을 구한다.
  const radius = Math.max(0, Math.min(window?.radius || 0, window?.width/2, window?.height/2));
  if (fit && radius > 0) {
    let low = 0, high = 1;
    for (let i=0; i<24; i++) {
      const scale = (low+high)/2;
      const x = (1-width*scale)*window.width/2, y = (1-height*scale)*window.height/2;
      const dx = Math.max(0,radius-x), dy = Math.max(0,radius-y);
      if (dx*dx+dy*dy <= radius*radius) low=scale; else high=scale;
    }
    width *= low; height *= low;
  }
  return { position: "absolute", maxWidth: "none", width: `${round(width*100/frame.width)}%`, height: `${round(height*100/frame.height)}%`,
    left: `${round((1-width)*50-frame.x/frame.width*width*100)}%`, top: `${round((1-height)*50-frame.y/frame.height*height*100)}%`, objectFit: "fill" };
}

export function samePhotoFrame(a, b) {
  return a === b || Boolean(a && b && (a.fit || "COVER") === (b.fit || "COVER")
    && ["x","y","width","height"].every((key) => Math.abs(a[key]-b[key]) < .0000005));
}

/** 저장한 배치를 슬라이더로 복원할 때 DB 소수점 반올림 때문에 불필요한 '수정됨'이 생기지 않게 한다. */
export function photoFrameControls(frame, window, source = WHOLE_PHOTO) {
  const baseWidth = Math.min(source.width, source.height * window.width/window.height);
  return { zoom: clamp(baseWidth/frame.width, 1, 4),
    x: source.width-frame.width > .000001 ? clamp((frame.x-source.x)/(source.width-frame.width), 0, 1) : .5,
    y: source.height-frame.height > .000001 ? clamp((frame.y-source.y)/(source.height-frame.height), 0, 1) : .5 };
}
