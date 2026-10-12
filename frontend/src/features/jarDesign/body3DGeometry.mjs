import { customJarBody } from "./customJarBody.mjs";

// 480px 그림판 좌표와 3D 좌표의 변환 기준이다. 사진/입구는 기존 2D 렌더러를 그대로 투영한다.
// 얇은 동전 대신 두툼한 저금통 느낌을 주되, 정면 사진 크기는 바꾸지 않는다.
// 앞뒤 곡면의 최대 깊이다. 바깥 테두리에서 0으로 모이고 사진 자리는 ±절반 깊이에 평평하게 남긴다.
export const BODY_3D_DEPTH = .72;
export const BODY_3D_VIEW = 1.02;
export const BODY_3D_SURFACE = BODY_3D_DEPTH / 2 + .007;
export const BODY_3D_FAILURE = "이 환경에서는 3D를 표시하지 못했어요. 기존 2D로 계속 이용할 수 있어요.";

export function bodyWorldPoint(point) {
  return { x: (point.x - .5) * 2, y: (.5 - point.y) * 2 };
}

/** 기존 검증을 통과한 숫자만 geometry로 전달한다. 임의 모델/HTML/외부 파일을 받지 않는다. */
export function body3DOutline(value) {
  return customJarBody(value) ? value.points.map(bodyWorldPoint) : null;
}

/** 앞뒤를 볼 수 있지만 위아래로 뒤집히지는 않도록 제한한다. */
export function bodyRotation(yaw, pitch) {
  return {
    yaw: Number.isFinite(yaw) ? Math.max(-Math.PI, Math.min(Math.PI, yaw)) : 0,
    pitch: Number.isFinite(pitch) ? Math.max(-.55, Math.min(.55, pitch)) : 0,
  };
}

/** 보이는 면 바깥에 같은 사진 평면을 놓는다. 뒷면 투영 자체가 좌우 반전하므로 별도 반전을 하지 않는다. */
export function bodyPhotoSurface(yaw, pitch) {
  const rotation = bodyRotation(yaw, pitch);
  const facing = Math.cos(rotation.yaw) * Math.cos(rotation.pitch);
  const side = facing >= 0 ? "front" : "back";
  return { side, depth: side === "front" ? BODY_3D_SURFACE : -BODY_3D_SURFACE,
    visible: Math.abs(facing) > .02 };
}

/** 두꺼운 틀을 기울여도 잘리지 않게 필요한 경우에만 카메라 범위를 넓힌다. 정면은 기존 크기를 유지한다. */
export function bodyViewExtent(points, yaw, pitch, aspect = 1) {
  const rotation = bodyRotation(yaw, pitch);
  const cy = Math.cos(rotation.yaw), sy = Math.sin(rotation.yaw);
  const cp = Math.cos(rotation.pitch), sp = Math.sin(rotation.pitch);
  const ratio = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  let extent = BODY_3D_VIEW;
  // 저장 외곽선은 최대 96점이다. GPU 전체 geometry 대신 앞뒤 경계만 확인한다.
  for (const z of [-BODY_3D_SURFACE, BODY_3D_SURFACE]) for (const p of points) {
    const x = cy * p.x + sy * z;
    const y = sp * sy * p.x + cp * p.y - sp * cy * z;
    extent = Math.max(extent, (Math.abs(x) + .02) / ratio, Math.abs(y) + .02);
  }
  return extent;
}

/** 정사영 카메라에서는 평면의 투영이 affine 변환이다. WebGL과 DOM 사진이 같은 좌표를 쓴다. */
export function projectedSurfaceMatrix(topLeft, topRight, bottomLeft) {
  const points = [topLeft, topRight, bottomLeft];
  if (!points.every(p => p && [p.x, p.y].every(Number.isFinite))) return null;
  return [(topRight.x-topLeft.x)/480, (topRight.y-topLeft.y)/480,
    (bottomLeft.x-topLeft.x)/480, (bottomLeft.y-topLeft.y)/480, topLeft.x, topLeft.y];
}

/** 오목한 외형에서는 축소한 구멍이 외곽을 벗어날 수 있다. 그런 빈 틀은 안전한 2D로 돌린다. */
export function canExtrudeHollowBody(body) {
  const outer = body?.customBody?.points;
  if (!outer) return false;
  const inner = body.photoOutline.map(p => ({x:p.x/480,y:p.y/480}));
  const cross = (a,b,c) => (b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
  const inside = p => {
    let result = false;
    for (let i=0,j=outer.length-1;i<outer.length;j=i++) {
      const a=outer[i],b=outer[j];
      if ((a.y>p.y)!==(b.y>p.y) && p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x) result=!result;
    }
    return result;
  };
  return inner.every(inside) && inner.every((a,i) => {
    const b=inner[(i+1)%inner.length];
    return outer.every((c,j) => {
      const d=outer[(j+1)%outer.length];
      return !(cross(a,b,c)*cross(a,b,d)<=0 && cross(c,d,a)*cross(c,d,b)<=0);
    });
  });
}
