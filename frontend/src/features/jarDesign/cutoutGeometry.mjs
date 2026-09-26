export const CUTOUT_MAX_REGIONS = 30;
export const CUTOUT_MAX_POINTS_PER_REGION = 240;
const CUTOUT_MAX_TOTAL_POINTS = 1200;
const PRECISION = 100000;

/** 서버와 같은 0~1 정규화 좌표로 한 영역의 점을 안전하게 정리한다. */
export function normalizeCutoutPoints(points) {
  if (!Array.isArray(points)) return [];

  return points
    .slice(0, CUTOUT_MAX_POINTS_PER_REGION)
    .map((point) => ({
      x: roundAndClamp(point?.x),
      y: roundAndClamp(point?.y),
    }))
    .filter((point) => point.x !== null && point.y !== null);
}

/** 기존 단일 점 배열과 새 다중 영역 배열을 모두 정규화한다. */
export function normalizeCutoutRegions(regionsOrPoints) {
  if (!Array.isArray(regionsOrPoints) || regionsOrPoints.length === 0) return [];
  const source = Array.isArray(regionsOrPoints[0]) ? regionsOrPoints : [regionsOrPoints];
  let totalPoints = 0;
  const regions = [];

  for (const sourceRegion of source.slice(0, CUTOUT_MAX_REGIONS)) {
    const region = normalizeCutoutPoints(sourceRegion);
    if (region.length < 3 || totalPoints + region.length > CUTOUT_MAX_TOTAL_POINTS) continue;
    regions.push(region);
    totalPoints += region.length;
  }
  return regions;
}

/** 여러 영역의 합집합을 브라우저 이미지에 적용할 SVG 마스크 스타일로 만든다. */
export function toCutoutMaskStyle(regionsOrPoints) {
  const regions = normalizeCutoutRegions(regionsOrPoints);
  if (regions.length === 0) return undefined;
  const polygons = regions.map((region) => {
    const points = region.map((point) => `${point.x * 1000},${point.y * 1000}`).join(" ");
    return `<polygon points="${points}" fill="white"/>`;
  }).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" preserveAspectRatio="none">${polygons}</svg>`;
  const image = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  return {
    WebkitMaskImage: image,
    maskImage: image,
    WebkitMaskSize: "100% 100%",
    maskSize: "100% 100%",
    WebkitMaskRepeat: "no-repeat",
    maskRepeat: "no-repeat",
  };
}

/** 이전 단일 영역 호출부와의 호환용 CSS polygon이다. */
export function toCutoutClipPath(points) {
  const normalized = normalizeCutoutPoints(points);
  if (normalized.length < 3) return undefined;
  return `polygon(${normalized.map((point) => `${point.x * 100}% ${point.y * 100}%`).join(", ")})`;
}

/** 영역 목록의 저장 여부를 비교해 불필요한 PATCH 요청을 막는다. */
export function sameCutoutRegions(left, right) {
  const a = normalizeCutoutRegions(left);
  const b = normalizeCutoutRegions(right);
  return a.length === b.length && a.every((region, regionIndex) => {
    const other = b[regionIndex];
    return region.length === other.length
      && region.every((point, pointIndex) => point.x === other[pointIndex].x && point.y === other[pointIndex].y);
  });
}

/** 기존 단일 영역 비교 호출과의 호환용 함수다. */
export function sameCutoutPoints(left, right) {
  return sameCutoutRegions(left, right);
}

/** 포인터 위치를 이미지 사각형 기준의 정규화 좌표로 바꾼다. */
export function cutoutPointAtPointer(clientX, clientY, bounds) {
  if (!bounds || bounds.width <= 0 || bounds.height <= 0) return null;
  return {
    x: roundAndClamp((clientX - bounds.left) / bounds.width),
    y: roundAndClamp((clientY - bounds.top) / bounds.height),
  };
}

/** 선이 너무 촘촘하면 드래그 한 번에 서버 허용 개수를 넘기므로 샘플 간격을 둔다. */
export function shouldAppendCutoutPoint(points, point, minimumDistance = 0.008) {
  if (!point || points.length === 0) return Boolean(point);
  const previous = points[points.length - 1];
  return Math.hypot(previous.x - point.x, previous.y - point.y) >= minimumDistance;
}

function roundAndClamp(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.round(Math.min(1, Math.max(0, number)) * PRECISION) / PRECISION;
}
