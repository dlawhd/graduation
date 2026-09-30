// CSS 크기와 무관한 원본 좌표를 구하고 캔버스 밖 입력을 제한한다.
export function drawingPoint(clientX, clientY, rect, size) {
  const clamp = (value) => Math.max(0, Math.min(size, value));
  return { x: clamp((clientX - rect.left) / rect.width * size), y: clamp((clientY - rect.top) / rect.height * size) };
}

/** 어느 방향으로 드래그해도 동일한 도형 경계를 만든다. */
export function drawShape(ctx, tool, start, end, fill) {
  const x = Math.min(start.x, end.x), y = Math.min(start.y, end.y);
  const w = Math.abs(end.x - start.x), h = Math.abs(end.y - start.y);
  ctx.beginPath();
  if (tool === "line") { ctx.moveTo(start.x, start.y); ctx.lineTo(end.x, end.y); }
  if (tool === "rectangle") ctx.rect(x, y, w, h);
  if (tool === "ellipse") ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
  if (tool === "triangle") {
    ctx.moveTo(x + w / 2, y); ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h); ctx.closePath();
  }
  if (tool === "rounded") {
    const r = Math.min(w, h) * 0.2;
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  const polygons = {
    rightTriangle: [[0, 0], [1, 1], [0, 1]], diamond: [[.5, 0], [1, .5], [.5, 1], [0, .5]],
    arrow: [[0, .3], [.6, .3], [.6, 0], [1, .5], [.6, 1], [.6, .7], [0, .7]],
    doubleArrow: [[0, .5], [.28, 0], [.28, .3], [.72, .3], [.72, 0], [1, .5], [.72, 1], [.72, .7], [.28, .7], [.28, 1]],
    lightning: [[.5, 0], [1, 0], [.65, .4], [.95, .4], [.15, 1], [.4, .55], [0, .55]],
    bubble: [[0, 0], [1, 0], [1, .75], [.45, .75], [.2, 1], [.2, .75], [0, .75]],
  };
  let vertices = polygons[tool];
  const sides = { pentagon: 5, hexagon: 6, octagon: 8, star: 10, star4: 8 }[tool];
  if (sides) vertices = Array.from({ length: sides }, (_, i) => {
    const radius = tool.startsWith("star") && i % 2 ? .22 : .5;
    const angle = -Math.PI / 2 + i * Math.PI * 2 / sides;
    return [.5 + Math.cos(angle) * radius, .5 + Math.sin(angle) * radius];
  });
  if (vertices) {
    vertices.forEach(([px, py], i) => ctx[i ? "lineTo" : "moveTo"](x + px * w, y + py * h));
    ctx.closePath();
  }
  if (tool === "heart") {
    ctx.moveTo(x + w / 2, y + h);
    ctx.bezierCurveTo(x - w * .3, y + h * .45, x + w * .05, y - h * .35, x + w / 2, y + h * .25);
    ctx.bezierCurveTo(x + w * .95, y - h * .35, x + w * 1.3, y + h * .45, x + w / 2, y + h);
    ctx.closePath();
  }
  if (tool === "cloud") {
    ctx.moveTo(x + w * .2, y + h * .9);
    ctx.bezierCurveTo(x - w * .1, y + h * .9, x - w * .05, y + h * .3, x + w * .22, y + h * .3);
    ctx.bezierCurveTo(x + w * .15, y - h * .1, x + w * .75, y - h * .1, x + w * .78, y + h * .3);
    ctx.bezierCurveTo(x + w * 1.1, y + h * .2, x + w * 1.1, y + h * .9, x + w * .8, y + h * .9);
    ctx.closePath();
  }
  if (fill && tool !== "line") ctx.fill();
  ctx.stroke();
}

export const BRUSHES = [
  ["pen", "둥근 펜"], ["pencil", "연필"], ["marker", "마커"],
  ["fountain", "캘리그래피"], ["crayon", "크레용"], ["spray", "스프레이"],
];
export const SHAPES = [
  ["line", "직선"], ["rectangle", "사각형"], ["rounded", "둥근 사각형"], ["ellipse", "원 · 타원"],
  ["triangle", "삼각형"], ["rightTriangle", "직각 삼각형"], ["diamond", "마름모"],
  ["pentagon", "오각형"], ["hexagon", "육각형"], ["octagon", "팔각형"],
  ["star", "별"], ["star4", "반짝임"], ["heart", "하트"], ["cloud", "구름"],
  ["arrow", "화살표"], ["doubleArrow", "양방향 화살표"], ["bubble", "말풍선"], ["lightning", "번개"],
];

/** Shift를 누르면 도형의 가로·세로를 같게 맞춘다. */
export function constrainShape(start, end) {
  const length = Math.min(Math.max(Math.abs(end.x - start.x), Math.abs(end.y - start.y)),
    end.x >= start.x ? 480 - start.x : start.x, end.y >= start.y ? 480 - start.y : start.y);
  return { x: start.x + (end.x >= start.x ? length : -length), y: start.y + (end.y >= start.y ? length : -length) };
}

/** 한 획의 원본 위에 다시 그려 마커 투명도가 포인터 이벤트 수에 따라 진해지는 것을 막는다. */
export function drawBrushStroke(ctx, points, { brush, color, size, opacity = 1 }) {
  ctx.save();
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineCap = "round"; ctx.lineJoin = "round";
  ctx.globalAlpha = opacity * (brush === "marker" ? .35 : brush === "pencil" ? .72 : 1);
  ctx.lineWidth = brush === "pencil" ? Math.max(1, size * .35) : size;
  if (brush === "fountain") {
    // 고정된 사선 펜촉의 양쪽 가장자리를 이어 방향에 따라 굵기가 달라지는 획을 만든다.
    const dx = size * .35, dy = -size * .35;
    ctx.beginPath();
    points.forEach((p, index) => {
      const previous = points[Math.max(0, index - 1)];
      ctx.moveTo(previous.x - dx, previous.y - dy);
      ctx.lineTo(p.x - dx + 1, p.y - dy + 1);
      ctx.lineTo(p.x + dx + 1, p.y + dy + 1);
      ctx.lineTo(previous.x + dx, previous.y + dy); ctx.closePath();
    });
    ctx.fill();
  } else if (brush === "crayon" || brush === "spray") {
    // 결정적 점 분포를 써 같은 획을 미리보기할 때 질감이 흔들리지 않게 한다.
    ctx.globalAlpha = opacity * (brush === "crayon" ? .6 : .3);
    const samples = [];
    points.forEach((p, i) => {
      const previous = points[Math.max(0, i - 1)];
      const steps = Math.max(1, Math.min(64, Math.ceil(Math.hypot(p.x - previous.x, p.y - previous.y) / Math.max(1, size * .2))));
      for (let step = 1; step <= steps; step++) samples.push({ x: previous.x + (p.x - previous.x) * step / steps, y: previous.y + (p.y - previous.y) * step / steps });
    });
    // 빠르게 드래그해도 포인터 이벤트 사이를 채워 질감이 점선처럼 끊기지 않게 한다.
    samples.forEach((p, i) => {
      for (let j = 0; j < (brush === "spray" ? 28 : 16); j++) {
        const angle = (i * 2.399 + j * 17.71);
        const radius = Math.sqrt(((i * 31 + j * 19) % 101) / 101) * size / 2;
        ctx.fillRect(p.x + Math.cos(angle) * radius, p.y + Math.sin(angle) * radius, brush === "spray" ? 1 : 1.5, 1.5);
      }
    });
  } else if (points.length === 1) {
    ctx.beginPath(); ctx.arc(points[0].x, points[0].y, ctx.lineWidth / 2, 0, Math.PI * 2); ctx.fill();
  } else {
    ctx.beginPath(); ctx.moveTo(points[0].x, points[0].y);
    points.slice(1).forEach((p) => ctx.lineTo(p.x, p.y)); ctx.stroke();
  }
  ctx.restore();
}

/** 큐와 방문 배열로 연결된 영역만 채운다. 재귀를 쓰지 않아 큰 흰 영역에서도 스택이 넘치지 않는다. */
export function floodFill(image, x, y, hex, tolerance = 24) {
  const { data, width, height } = image;
  x = Math.max(0, Math.min(width - 1, Math.floor(x))); y = Math.max(0, Math.min(height - 1, Math.floor(y)));
  const start = y * width + x;
  const target = Array.from(data.slice(start * 4, start * 4 + 4));
  const replacement = [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16)).concat(255);
  if (target.every((v, i) => v === replacement[i])) return false;
  const queue = new Int32Array(width * height), visited = new Uint8Array(width * height);
  let head = 0, tail = 1; queue[0] = start; visited[start] = 1;
  while (head < tail) {
    const pixel = queue[head++], offset = pixel * 4;
    if (!target.every((value, i) => Math.abs(data[offset + i] - value) <= tolerance)) continue;
    data.set(replacement, offset);
    const neighbors = [pixel - width, pixel + width];
    if (pixel % width) neighbors.push(pixel - 1);
    if (pixel % width < width - 1) neighbors.push(pixel + 1);
    for (const next of neighbors) if (next >= 0 && next < width * height && !visited[next]) {
      visited[next] = 1; queue[tail++] = next;
    }
  }
  return true;
}

/** 화면 가장자리에서도 유효한 한 픽셀을 읽는다. */
export function sampledColor(ctx, point) {
  const data = ctx.getImageData(Math.min(479, Math.floor(point.x)), Math.min(479, Math.floor(point.y)), 1, 1).data;
  return `#${Array.from(data.slice(0, 3), (v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/** 모두 지운 흰 그림을 업로드하지 않도록 실제 유색 픽셀을 확인한다. */
export function hasDrawingPixels(data) {
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] > 0 && (data[i] < 255 || data[i + 1] < 255 || data[i + 2] < 255)) return true;
  }
  return false;
}
