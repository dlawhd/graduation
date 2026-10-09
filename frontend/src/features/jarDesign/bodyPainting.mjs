import { MAX_BODY_POINTS, outlineError } from "./customJarBody.mjs";
import { floodFill } from "./drawingTools.mjs";

/** 틀의 채우기는 색보다 영역을 기준으로 한다. 반투명 테두리의 RGB 때문에 빈 구멍이 남지 않게 한다. */
export function fillPaintedBody(image, x, y, color) {
  const { width, height, data } = image;
  const start = Math.max(0, Math.min(height - 1, Math.floor(y))) * width + Math.max(0, Math.min(width - 1, Math.floor(x)));
  if (data[start * 4 + 3] >= 48) return false;
  // 기존 반복식 채우기를 흑백 마스크에 재사용한다. 실제 그림의 가장자리와 나머지 픽셀은 보존한다.
  const mask = { width, height, data: new Uint8ClampedArray(data.length) };
  for (let i = 0; i < data.length; i += 4) mask.data.set(data[i + 3] >= 48 ? [0, 0, 0, 255] : [255, 255, 255, 255], i);
  floodFill(mask, x, y, "#ff0000", 0);
  const rgba = [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16)).concat(255);
  for (let i = 0; i < data.length; i += 4) if (mask.data[i] === 255 && mask.data[i + 1] === 0) data.set(rgba, i);
  return true;
}

/** 그림판의 색칠 영역을 기존 V51 좌표 계약으로 바꾼다. 픽셀/PNG를 서버에 추가로 저장하지 않는다. */
export function paintedBodyOutline(image, fallbackColor = "#d7e9df") {
  const { width, height, data } = image || {};
  const fail = error => ({ value: { points: [], color: fallbackColor }, error });
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 8 || height < 8
      || width > 480 || height > 480 || data?.length !== width * height * 4)
    return fail("틀 그림을 읽지 못했어요. 다시 그려주세요.");
  const mask = new Uint8Array(width * height);
  const left = Math.ceil(width * .05), top = Math.ceil(height * .05);
  const right = Math.floor(width * .95), bottom = Math.floor(height * .95);
  let first = -1, count = 0, colorPixel = -1, colorAlpha = 0;
  for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) {
    const index = y * width + x;
    const alpha = data[index * 4 + 3];
    if (alpha >= 48) {
      mask[index] = 1; count++; if (first < 0) first = index;
      // 안티앨리어싱 가장자리의 RGB 반올림으로 팔레트 색이 바뀌지 않도록 가장 불투명한 픽셀을 사용한다.
      if (alpha > colorAlpha) { colorPixel = index; colorAlpha = alpha; }
    }
  }
  if (first < 0) return fail("펜이나 도형으로 사진을 담을 모양을 그려주세요.");
  const color = "#" + Array.from(data.slice(colorPixel * 4, colorPixel * 4 + 3), n => n.toString(16).padStart(2, "0")).join("");
  const failed = error => ({ value: { points: [], color }, error });
  const visited = new Uint8Array(mask.length), queue = new Int32Array(mask.length);
  let head = 0, tail = 1; queue[0] = first; visited[first] = 1;
  // 하나로 연결된 영역만 허용한다. 작은 조각을 임의로 삭제하거나 가장 큰 조각만 저장하지 않는다.
  while (head < tail) {
    const p = queue[head++], neighbors = [p - width, p + width];
    if (p % width) neighbors.push(p - 1);
    if (p % width < width - 1) neighbors.push(p + 1);
    for (const n of neighbors) if (n >= 0 && n < mask.length && mask[n] && !visited[n]) {
      visited[n] = 1; queue[tail++] = n;
    }
  }
  if (tail !== count) return failed("떨어진 조각은 펜으로 이어주세요. 하나로 연결된 틀을 사용할 수 있어요.");

  // 바깥 빈 공간을 먼저 방문한다. 내부 구멍은 현재 단일 외곽선 계약으로 표현할 수 없으므로 안내한다.
  visited.fill(0); head = 0; tail = 1; queue[0] = 0; visited[0] = 1;
  while (head < tail) {
    const p = queue[head++], neighbors = [p - width, p + width];
    if (p % width) neighbors.push(p - 1);
    if (p % width < width - 1) neighbors.push(p + 1);
    for (const n of neighbors) if (n >= 0 && n < mask.length && !mask[n] && !visited[n]) {
      visited[n] = 1; queue[tail++] = n;
    }
  }
  if (count + tail !== mask.length) return failed("틀 안쪽의 빈 곳을 채우기로 메워주세요. 사진 창은 다음 단계에서 만들어져요.");

  const stride = width + 1, edges = new Map();
  let ambiguous = false;
  const edge = (x, y, nx, ny) => {
    const a = y * stride + x;
    if (edges.has(a)) ambiguous = true;
    edges.set(a, ny * stride + nx);
  };
  for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) {
    const p = y * width + x;
    if (!mask[p]) continue;
    if (!mask[p - width]) edge(x, y, x + 1, y);
    if (!mask[p + 1]) edge(x + 1, y, x + 1, y + 1);
    if (!mask[p + width]) edge(x + 1, y + 1, x, y + 1);
    if (!mask[p - 1]) edge(x, y + 1, x, y);
  }
  if (ambiguous) return failed("아주 가늘게 맞닿은 곳을 조금 더 넓게 칠해주세요.");
  const start = edges.keys().next().value, boundary = [];
  let vertex = start;
  do {
    boundary.push({ x: vertex % stride, y: Math.floor(vertex / stride) });
    vertex = edges.get(vertex);
    if (vertex == null || boundary.length > edges.size) return failed("외곽선을 읽지 못했어요. 모양을 조금 더 단순하게 다듬어주세요.");
  } while (vertex !== start);
  if (boundary.length !== edges.size) return failed("틀의 선이 겹치는 곳을 다시 다듬어주세요.");

  const turns = boundary.filter((b, i) => {
    const a = boundary[(i + boundary.length - 1) % boundary.length], c = boundary[(i + 1) % boundary.length];
    return (b.x - a.x) * (c.y - b.y) !== (b.y - a.y) * (c.x - b.x);
  });
  // 최대 96점 안에서 2.5px 이하의 근사만 허용한다. 복잡한 모양을 크게 변형해서 몰래 저장하지 않는다.
  for (const tolerance of [0, .5, .75, 1, 1.5, 2, 2.5]) {
    const reduced = tolerance ? simplifyClosedOutline(turns, tolerance) : turns;
    if (reduced.length > MAX_BODY_POINTS) continue;
    const value = { points: reduced.map(p => ({ x: Math.round(p.x / width * 1e5) / 1e5,
      y: Math.round(p.y / height * 1e5) / 1e5 })), color };
    if (!outlineError(value)) return { value, error: "" };
  }
  if (count < width * height * .05) return failed("사진을 담을 수 있도록 조금 더 넓게 칠해주세요.");
  return failed("틀이 너무 가늘거나 복잡해요. 지우개와 펜으로 외곽선을 조금 더 단순하게 다듬어주세요.");
}

/** 닫힌 선을 두 경로로 나눠 반복 처리한다. 긴 윤곽에서도 재귀 호출 스택을 사용하지 않는다. */
function simplifyClosedOutline(points, tolerance) {
  let split = 1, farthest = 0;
  for (let i = 1; i < points.length; i++) {
    const distance = (points[i].x - points[0].x) ** 2 + (points[i].y - points[0].y) ** 2;
    if (distance > farthest) { farthest = distance; split = i; }
  }
  const simplify = chain => {
    const keep = new Uint8Array(chain.length); keep[0] = keep[chain.length - 1] = 1;
    const stack = [[0, chain.length - 1]];
    while (stack.length) {
      const [from, to] = stack.pop(), a = chain[from], b = chain[to];
      let index = -1, largest = tolerance ** 2;
      const dx = b.x - a.x, dy = b.y - a.y, length = dx * dx + dy * dy;
      for (let i = from + 1; i < to; i++) {
        const p = chain[i], ratio = length ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length)) : 0;
        const distance = (p.x - a.x - ratio * dx) ** 2 + (p.y - a.y - ratio * dy) ** 2;
        if (distance > largest) { largest = distance; index = i; }
      }
      if (index >= 0) { keep[index] = 1; stack.push([from, index], [index, to]); }
    }
    return chain.filter((_, i) => keep[i]);
  };
  return [...simplify(points.slice(0, split + 1)).slice(0, -1),
    ...simplify([...points.slice(split), points[0]]).slice(0, -1)];
}
