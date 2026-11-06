const SIZE = 480;
const round = value => Math.round(value * 10000) / 10000;
const pointKey = p => `${round(p.x)},${round(p.y)}`;
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/** 한 직선의 안쪽만 남긴다. 정해진 소수의 분할점으로 실제 조각과 금이 공유하는 평면 분할을 만든다. */
function clipHalfPlane(polygon, a, b, c) {
  const result = [];
  for (let i = 0; i < polygon.length; i++) {
    const start = polygon[i], end = polygon[(i + 1) % polygon.length];
    const ds = a * start.x + b * start.y - c, de = a * end.x + b * end.y - c;
    const insideStart = ds <= 1e-7, insideEnd = de <= 1e-7;
    if (insideStart) result.push(start);
    if (insideStart !== insideEnd) {
      const t = ds / (ds - de);
      result.push({ x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t });
    }
  }
  return result;
}

/** 경계 양쪽 조각은 똑같은 굴곡 좌표를 역순으로 사용한다. 따로 그린 장식 선은 만들지 않는다. */
function roughEdge(a, b, key) {
  const length = distance(a, b), count = Math.max(2, Math.ceil(length / 24));
  let hash = 0;
  for (const ch of key) hash = (Math.imul(hash, 31) + ch.charCodeAt(0)) >>> 0;
  const points = [a];
  for (let i = 1; i < count; i++) {
    const t = i / count;
    hash = (Math.imul(hash, 1664525) + 1013904223) >>> 0;
    const offset = ((hash / 4294967296) * 2 - 1) * Math.min(5, length / 18) * Math.sin(Math.PI * t);
    points.push({ x: round(a.x + (b.x - a.x) * t - (b.y - a.y) / length * offset),
      y: round(a.y + (b.y - a.y) * t + (b.x - a.x) / length * offset) });
  }
  points.push(b); return points;
}

/** 타격점에서 이어지는 균열과 그 경계 그대로 떨어지는 조각을 한 번에 만든다. 난수·외부 라이브러리 없이 재현 가능하다. */
export function buildJarFracture({ contains = () => true, preferred = { x: 300, y: 156 } } = {}) {
  const seeds = [[80, 70], [208, 63], [351, 71], [439, 152], [114, 202], [269, 179],
    [373, 278], [49, 333], [196, 329], [297, 405], [442, 427], [113, 452]].map(([x, y]) => ({ x, y }));
  const cells = seeds.map((seed, index) => {
    let polygon = [{ x: 0, y: 0 }, { x: SIZE, y: 0 }, { x: SIZE, y: SIZE }, { x: 0, y: SIZE }];
    seeds.forEach((other, j) => {
      if (index === j) return;
      polygon = clipHalfPlane(polygon, other.x - seed.x, other.y - seed.y,
        (other.x ** 2 + other.y ** 2 - seed.x ** 2 - seed.y ** 2) / 2);
    });
    return { id: `shard-${index}`, polygon: polygon.map(p => ({ x: round(p.x), y: round(p.y) })) };
  });
  const edgeMap = new Map();
  cells.forEach(cell => {
    cell.edges = cell.polygon.map((a, index) => {
      const b = cell.polygon[(index + 1) % cell.polygon.length];
      const [first, last] = pointKey(a) < pointKey(b) ? [a, b] : [b, a];
      const key = `${pointKey(first)}:${pointKey(last)}`;
      if (!edgeMap.has(key)) edgeMap.set(key, { id: `edge-${edgeMap.size}`, a: first, b: last, owners: [] });
      const edge = edgeMap.get(key); edge.owners.push(cell.id);
      return { edge, forward: pointKey(a) === pointKey(first) };
    });
  });
  const edges = [...edgeMap.values()];
  edges.forEach(edge => {
    edge.internal = edge.owners.length === 2;
    edge.points = edge.internal ? roughEdge(edge.a, edge.b, `${pointKey(edge.a)}:${pointKey(edge.b)}`) : [edge.a, edge.b];
    edge.path = "M" + edge.points.map(p => `${p.x} ${p.y}`).join("L");
    edge.length = edge.points.slice(1).reduce((sum, p, index) => sum + distance(edge.points[index], p), 0);
  });
  const nodes = [...new Map(edges.filter(edge => edge.internal).flatMap(edge => [edge.a, edge.b]).map(p => [pointKey(p), p])).values()];
  const candidates = nodes.filter(p => p.x > 20 && p.x < 460 && p.y > 20 && p.y < 460 && contains(p.x, p.y));
  const impact = (candidates.length ? candidates : nodes).reduce((best, p) => distance(p, preferred) < distance(best, preferred) ? p : best);
  // 균열이 타격점에서부터 연결된 순서로 퍼지도록 그래프의 최단 거리를 계산한다.
  const distances = new Map(nodes.map(p => [pointKey(p), Infinity])); distances.set(pointKey(impact), 0);
  for (let pass = 0; pass < nodes.length; pass++) for (const edge of edges.filter(e => e.internal)) {
    const a = pointKey(edge.a), b = pointKey(edge.b), da = distances.get(a), db = distances.get(b);
    if (da + edge.length < db) distances.set(b, da + edge.length);
    if (db + edge.length < da) distances.set(a, db + edge.length);
  }
  const cracks = edges.filter(edge => edge.internal).sort((a, b) =>
    Math.min(distances.get(pointKey(a.a)), distances.get(pointKey(a.b))) - Math.min(distances.get(pointKey(b.a)), distances.get(pointKey(b.b))) || a.id.localeCompare(b.id));
  cracks.forEach((edge, index) => { edge.stage = index < 3 ? 1 : index < Math.ceil(cracks.length * .65) ? 2 : 3;
    if (distances.get(pointKey(edge.a)) > distances.get(pointKey(edge.b))) {
      edge.path = "M" + [...edge.points].reverse().map(p => `${p.x} ${p.y}`).join("L");
    }
  });
  const pieces = cells.map((cell, index) => {
    const points = cell.edges.flatMap(({ edge, forward }) => (forward ? edge.points : [...edge.points].reverse()).slice(0, -1));
    const center = cell.polygon.reduce((sum, p) => ({ x: sum.x + p.x / cell.polygon.length, y: sum.y + p.y / cell.polygon.length }), { x: 0, y: 0 });
    return { id: cell.id, points, path: "M" + points.map(p => `${p.x / SIZE} ${p.y / SIZE}`).join("L") + "Z",
      center, x: round((center.x - impact.x) * .45), y: round(145 + center.y * .23),
      rotate: (index % 2 ? 1 : -1) * (13 + index * 2), delay: index * .018 };
  });
  return { impact, pieces, cracks };
}

/** 금의 실제 좌표를 투명한 틈으로 뚫는다. 조각 경계와 똑같은 선을 사용하므로 분리 시 위치가 어긋나지 않는다. */
export function crackCutoutUrl(cracks, damage) {
  if (!damage) return null;
  const paths = cracks.filter(edge => edge.stage <= damage).map(edge => `<path d="${edge.path}"/>`).join("");
  const width = damage === 1 ? 1.8 : damage === 2 ? 3 : 4;
  return "data:image/svg+xml," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="480" height="480"><defs><mask id="cut"><rect width="480" height="480" fill="white"/><g fill="none" stroke="black" stroke-width="${width}" stroke-linejoin="round">${paths}</g></mask></defs><rect width="480" height="480" fill="white" mask="url(#cut)"/></svg>`);
}
