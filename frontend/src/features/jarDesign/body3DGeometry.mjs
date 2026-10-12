import { customJarBody, customContainWindow } from "./customJarBody.mjs";

// 480px 그림판 좌표와 3D 좌표의 변환 기준이다. 사진/입구는 기존 2D 렌더러를 그대로 투영한다.
// 얇은 동전 대신 두툼한 저금통 느낌을 주되, 정면 사진 크기는 바꾸지 않는다.
// 앞뒤 곡면의 최대 깊이다. 바깥 테두리에서 0으로 모이고 사진 자리는 ±절반 깊이에 평평하게 남긴다.
export const BODY_3D_DEPTH = .46;
// 옆 연결 띠는 얇게 두고 나머지 깊이를 앞뒤 곡면에 나눠 준다. 전체 깊이와 별도로 조정한다.
export const BODY_3D_EDGE_DEPTH = .025;
// 3D에서만 곡면의 어깨를 조금 넓힌다. 사진 전체를 같은 비율로 줄여 원본의 자르기/확대는 유지한다.
export const BODY_3D_PHOTO_SCALE = .76 / .88;
export const BODY_3D_VIEW = 1.02;
export const BODY_3D_SURFACE = BODY_3D_DEPTH / 2 + .007;
export const BODY_3D_FAILURE = "이 환경에서는 3D를 표시하지 못했어요. 기존 2D로 계속 이용할 수 있어요.";

/** 테두리부터 사진 자리까지 천천히 솟는 앞면 깊이. 뒷면은 부호만 반대로 적용한다. */
export function bodyDomeDepth(progress) {
  const t=Number.isFinite(progress)?Math.max(0,Math.min(1,progress)):0;
  return BODY_3D_EDGE_DEPTH/2+(BODY_3D_DEPTH-BODY_3D_EDGE_DEPTH)/2*Math.sin(t*Math.PI/2);
}

export function bodyWorldPoint(point) {
  return { x: (point.x - .5) * 2, y: (.5 - point.y) * 2 };
}

/** 기존 검증을 통과한 숫자만 geometry로 전달한다. 임의 모델/HTML/외부 파일을 받지 않는다. */
export function body3DOutline(value) {
  return customJarBody(value) ? roundedOutline(value.points).map(bodyWorldPoint) : null;
}

/** 원본은 변경하지 않고 3D 모서리에만 최대 3px의 작은 이차 곡선을 넣는다. 선이 교차하면 원본으로 보호한다. */
function roundedOutline(points) {
  const result=[];
  for(let i=0;i<points.length;i++) {
    const a=points[(i+points.length-1)%points.length],b=points[i],c=points[(i+1)%points.length];
    const left=Math.hypot(a.x-b.x,a.y-b.y),right=Math.hypot(c.x-b.x,c.y-b.y),cut=Math.min(3/480,left*.16,right*.16);
    const from={x:b.x+(a.x-b.x)*cut/left,y:b.y+(a.y-b.y)*cut/left};
    const to={x:b.x+(c.x-b.x)*cut/right,y:b.y+(c.y-b.y)*cut/right};
    for(let step=0;step<4;step++) {
      const t=step/3,u=1-t;
      result.push({x:u*u*from.x+2*u*t*b.x+t*t*to.x,y:u*u*from.y+2*u*t*b.y+t*t*to.y});
    }
  }
  // 곡선을 넣어도 좁은 골짜기를 닫거나 서로 다른 팔다리를 합치지 않는다.
  for(let i=0;i<result.length;i++) for(let j=i+2;j<result.length;j++) {
    if(i===0 && j===result.length-1) continue;
    if(crossing(result[i],result[(i+1)%result.length],result[j],result[(j+1)%result.length])) return points.map(p=>({...p}));
  }
  return result;
}

function crossing(a,b,c,d) {
  if(Math.max(a.x,b.x)<Math.min(c.x,d.x) || Math.max(c.x,d.x)<Math.min(a.x,b.x)
    || Math.max(a.y,b.y)<Math.min(c.y,d.y) || Math.max(c.y,d.y)<Math.min(a.y,b.y)) return false;
  const cross=(p,q,r)=>(q.x-p.x)*(r.y-p.y)-(q.y-p.y)*(r.x-p.x);
  return cross(a,b,c)*cross(a,b,d)<=0 && cross(c,d,a)*cross(c,d,b)<=0;
}

/** 저장/2D 경계를 바꾸지 않고 3D 사진 판과 곡면이 만나는 경계를 함께 계산한다. */
export function body3DProfile(value) {
  const body=customJarBody(value);
  if (!body) return null;
  const w=body.window,cx=w.x+w.width/2,cy=w.y+w.height/2,scale=BODY_3D_PHOTO_SCALE;
  const renderOutline=roundedOutline(value.points);
  const desired=body.photoOutline.map(p=>({x:(cx+(p.x-cx)*scale)/480,y:(cy+(p.y-cy)*scale)/480}));
  const profile={...body,renderOutline,window:{...w,x:cx-w.width*scale/2,y:cy-w.height*scale/2,width:w.width*scale,height:w.height*scale},
    photoOutline:roundedOutline(desired).map(p=>({x:p.x*480,y:p.y*480})),photoMode:"OUTLINE",photoSafe:true};
  if(canExtrudeHollowBody(profile)) return profile;
  // 중심 축소만 하면 깊은 오목한 틀의 사진 창이 몸통을 벗어난다. 기존 전체 보기 탐색으로 안전한 창을 찾는다.
  const safe=customContainWindow({...profile,photoOutline:renderOutline.map(p=>({x:p.x*480,y:p.y*480}))},
    {width:profile.window.width,height:profile.window.height});
  const width=safe.width*.94,height=safe.height*.94,x=safe.x+(safe.width-width)/2,y=safe.y+(safe.height-height)/2;
  profile.photoOutline=[{x,y},{x:x+width,y},{x:x+width,y:y+height},{x,y:y+height}];
  profile.photoMode="SAFE_WINDOW";
  profile.photoSafe=width>1 && height>1 && canExtrudeHollowBody(profile);
  return profile;
}

/** 전체 보기 사진도 보정된 3D 창 안에 담는다. DOM의 축소 전 좌표로 돌려 저장한 배치를 덮어쓰지 않는다. */
export function body3DContainWindow(profile,frame) {
  const w=profile.window,scale=BODY_3D_PHOTO_SCALE,cx=w.x+w.width/2,cy=w.y+w.height/2;
  const outline=profile.photoOutline.map(p=>({x:cx+(p.x-cx)/scale,y:cy+(p.y-cy)/scale}));
  const xs=outline.map(p=>p.x),ys=outline.map(p=>p.y),x=Math.min(...xs),y=Math.min(...ys);
  return customContainWindow({photoOutline:outline,window:{x,y,width:Math.max(...xs)-x,height:Math.max(...ys)-y}},frame);
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
  // 저장 외곽선은 최대 96점, 3D 곡선은 최대 384점이다. GPU 전체 geometry 대신 앞뒤 경계만 확인한다.
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

/** 오목한 외형의 구멍이 외곽을 벗어나는지 검사한다. 안전한 창도 만들 수 없을 때는 2D로 보호한다. */
export function canExtrudeHollowBody(body) {
  const outer = body?.renderOutline || body?.customBody?.points;
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
