/** 직접 만든 틀은 좌표와 색상만 사용한다. SVG/HTML/URL 문자열은 받지 않는다. */
const round = n => Math.round(n * 100000) / 100000;
export const MAX_BODY_POINTS = 96;
export const BODY_DRAFT_KEY = "memoryjar.body-workshop.v1";
export function outlineError(value) {
  const points = value?.points;
  if (!Array.isArray(points) || points.length < 3) return "외곽선을 넓게 그리거나 점을 3개 이상 찍어주세요.";
  if (points.length > MAX_BODY_POINTS || !/^#[0-9a-f]{6}$/i.test(value?.color || "")) return "틀의 좌표와 색상을 확인해 주세요.";
  if (points.some(p => !p || ![p.x,p.y].every(n => Number.isFinite(n) && n >= .05 && n <= .95))) return "선은 작업 영역 안에 그려주세요.";
  const cross = (a,b,c) => (b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
  const onLine = (a,b,p,c) => Math.abs(c)<1e-10 && p.x>=Math.min(a.x,b.x) && p.x<=Math.max(a.x,b.x) && p.y>=Math.min(a.y,b.y) && p.y<=Math.max(a.y,b.y);
  let area=0;
  for (let i=0; i<points.length; i++) {
    const a=points[i],b=points[(i+1)%points.length];
    if (Math.hypot(a.x-b.x,a.y-b.y)<.0001) return "같은 위치의 점은 하나만 남겨주세요.";
    area+=a.x*b.y-b.x*a.y;
    for (let j=i+2; j<points.length; j++) {
      if (i===0 && j===points.length-1) continue;
      const c=points[j],d=points[(j+1)%points.length],ac=cross(a,b,c),ad=cross(a,b,d),ca=cross(c,d,a),cb=cross(c,d,b);
      if ((ac*ad<0 && ca*cb<0) || onLine(a,b,c,ac) || onLine(a,b,d,ad) || onLine(c,d,a,ca) || onLine(c,d,b,cb)) return "선이 교차하지 않게 외곽선을 한 바퀴 그려주세요.";
    }
  }
  const xs=points.map(p=>p.x),ys=points.map(p=>p.y);
  if (Math.max(...xs)-Math.min(...xs)<.25 || Math.max(...ys)-Math.min(...ys)<.25 || Math.abs(area)/2<.05) return "사진을 담을 수 있도록 틀을 조금 더 크게 만들어주세요.";
  return "";
}
export function basicBodyOutline(kind="ROUND", color="#d7e9df") {
  let points;
  if (kind==="JAR") points=[{x:.31,y:.18},{x:.69,y:.18},{x:.69,y:.28},{x:.82,y:.4},{x:.82,y:.8},{x:.72,y:.88},{x:.28,y:.88},{x:.18,y:.8},{x:.18,y:.4},{x:.31,y:.28}];
  else if (kind==="SQUARE") points=[{x:.22,y:.2},{x:.78,y:.2},{x:.85,y:.27},{x:.85,y:.79},{x:.78,y:.86},{x:.22,y:.86},{x:.15,y:.79},{x:.15,y:.27}];
  else points=Array.from({length:48},(_,i)=>({x:round(.5+.35*Math.cos(i*Math.PI/24)),y:round(.52+.38*Math.sin(i*Math.PI/24))}));
  return {points,color};
}
/** 사진 배치와 최종 표시가 같은 경계를 사용한다. 사진 창도 외곽선과 같은 모양이다. */
export function customJarBody(value) {
  if (outlineError(value)) return null;
  const xs=value.points.map(p=>p.x*480),ys=value.points.map(p=>p.y*480);
  const x=Math.min(...xs),y=Math.min(...ys),width=Math.max(...xs)-x,height=Math.max(...ys)-y;
  const path="M"+value.points.map(p=>`${round(p.x*480)} ${round(p.y*480)}`).join("L")+"Z";
  return {id:"CUSTOM",name:"내가 만든 틀",path,customBody:value,
    window:{x:x+width*.06,y:y+height*.06,width:width*.88,height:height*.88,radius:0},
    photoOutline:value.points.map(p=>({x:x+(p.x*480-x)*.88+width*.06,y:y+(p.y*480-y)*.88+height*.06})),
    slot:{centerX:(x+width/2)/480,centerY:(y+height*.16)/480,sizeRatio:-.15,slotStyle:"CAPSULE"}};
}

/** 전체 보기에서는 사진 네 모서리와 변이 모두 틀 안에 들어가는 사각형에 사진을 놓는다.
 * 모양을 다시 그릴 때만 계산한다. 오목한 틀도 변 교차를 검사해 사진 일부가 잘리지 않게 한다. */
export function customContainWindow(body, frame) {
  const polygon=body.photoOutline, w=body.window, ratio=frame.width/frame.height;
  const inside=p=>{
    let result=false;
    for(let i=0,j=polygon.length-1;i<polygon.length;j=i++) {
      const a=polygon[i],b=polygon[j];
      if((a.y>p.y)!==(b.y>p.y) && p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x) result=!result;
    }
    return result;
  };
  const cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
  const fits=(center,width,height)=>{
    const corners=[{x:center.x-width/2,y:center.y-height/2},{x:center.x+width/2,y:center.y-height/2},
      {x:center.x+width/2,y:center.y+height/2},{x:center.x-width/2,y:center.y+height/2}];
    if(!corners.every(inside)) return false;
    for(let i=0;i<4;i++) for(let j=0;j<polygon.length;j++) {
      const a=corners[i],b=corners[(i+1)%4],c=polygon[j],d=polygon[(j+1)%polygon.length];
      if(cross(a,b,c)*cross(a,b,d)<0 && cross(c,d,a)*cross(c,d,b)<0) return false;
    }
    return true;
  };
  const centers=[{x:w.x+w.width/2,y:w.y+w.height/2}];
  for(let x=1;x<16;x++) for(let y=1;y<16;y++) centers.push({x:w.x+w.width*x/16,y:w.y+w.height*y/16});
  // 단순 다각형에는 내부 삼각형이 존재한다. 얇은 오목한 모양도 탐색할 수 있도록 꼭짓점 사이의 중심을 추가한다.
  for(let i=0;i<polygon.length;i++) {
    const a=polygon[i],b=polygon[(i+1)%polygon.length],c=polygon[(i+2)%polygon.length];
    centers.push({x:(a.x+b.x+c.x)/3,y:(a.y+b.y+c.y)/3});
  }
  let best={x:w.x+w.width/2,y:w.y+w.height/2,width:0,height:0,radius:0};
  for(const center of centers) {
    if(!inside(center)) continue;
    let low=0,high=Math.min(2*(center.x-w.x),2*(w.x+w.width-center.x),2*(center.y-w.y)*ratio,2*(w.y+w.height-center.y)*ratio);
    if(high<=best.width) continue;
    for(let i=0;i<16;i++) { const width=(low+high)/2; if(fits(center,width,width/ratio)) low=width; else high=width; }
    if(low>best.width) best={x:center.x-low/2,y:center.y-low/ratio/2,width:low,height:low/ratio,radius:0};
  }
  return best;
}
export function readBodyDraft(storage) {
  try { const value=JSON.parse(storage?.getItem(BODY_DRAFT_KEY)); return customJarBody(value) ? value : null; }
  catch { return null; }
}
