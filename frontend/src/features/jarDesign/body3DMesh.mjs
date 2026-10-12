import { BufferGeometry, Float32BufferAttribute, ShapeUtils, Vector2 } from "three";
import { customJarBody } from "./customJarBody.mjs";
import { bodyWorldPoint, canExtrudeHollowBody, BODY_3D_DEPTH } from "./body3DGeometry.mjs";

/** 저장 외곽선 안에서만 앞뒤를 부풀린다. 사진 자리는 평평하게 남기고 외곽에서 양쪽 곡면을 연결한다. */
export function roundedBodyGeometry(value, hollow = false) {
  const body = customJarBody(value);
  if (!body) throw new Error("Unsupported outline");
  const insetFits = canExtrudeHollowBody(body);
  if (hollow && !insetFits) throw new Error("Unsupported outline");
  const outer = value.points.map(bodyWorldPoint).map(p => new Vector2(p.x, p.y));
  const inner = body.photoOutline.map(p => bodyWorldPoint({x:p.x/480,y:p.y/480})).map(p => new Vector2(p.x, p.y));
  const halfDepth = BODY_3D_DEPTH / 2;
  const positions = [], indices = [], vertices = new Map();
  // 사진 배치만 바뀔 때는 다시 만들지 않는다. 최대 96점, 12개 곡면 링 또는 3단계 분할로 부담을 제한한다.
  const distance = (p, polygon) => {
    let best = Infinity;
    for (let i=0;i<polygon.length;i++) {
      const a=polygon[i], b=polygon[(i+1)%polygon.length], dx=b.x-a.x, dy=b.y-a.y;
      const t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy)));
      best=Math.min(best,Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy));
    }
    return best;
  };
  const rimWidth = Math.min(body.window.width,body.window.height)/480*.12;
  const height = p => {
    const outside=distance(p,outer);
    // 안쪽 윤곽이 외곽을 벗어나는 깊은 오목한 틀은 외곽까지의 거리로 안전하게 부푼다.
    const t=insetFits ? outside/Math.max(outside+distance(p,inner),1e-12) : Math.min(1,outside/rimWidth);
    return halfDepth*Math.sqrt(Math.max(0,t*(2-t)));
  };
  const vertex = (p,z) => {
    const key=`${p.x.toFixed(8)},${p.y.toFixed(8)},${z.toFixed(8)}`;
    if (!vertices.has(key)) {
      vertices.set(key,positions.length/3);positions.push(p.x,p.y,z);
    }
    return vertices.get(key);
  };
  const finish = () => {
    if (!positions.every(Number.isFinite)) throw new Error("Invalid geometry");
    const geometry=new BufferGeometry();
    geometry.setAttribute("position",new Float32BufferAttribute(positions,3));geometry.setIndex(indices);
    geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();
    return geometry;
  };
  const center=bodyWorldPoint({x:(body.window.x+body.window.width/2)/480,y:(body.window.y+body.window.height/2)/480});
  const cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
  const direction=ShapeUtils.isClockWise(outer)?-1:1;
  // 중심을 향해 줄여도 선이 접히지 않는 틀은 일정한 곡률의 링으로 만든다. 귀/볼이 매끈하게 이어진다.
  const ringSafe=insetFits && outer.every((a,i)=>direction*cross(a,outer[(i+1)%outer.length],center)>1e-10);
  if (ringSafe) {
    const contour=[],photoContour=[];
    for (let i=0;i<outer.length;i++) {
      const a=outer[i],b=outer[(i+1)%outer.length],steps=Math.min(4,Math.max(1,Math.ceil(a.distanceTo(b)/.04)));
      for (let step=0;step<steps;step++) {
        contour.push(a.clone().lerp(b,step/steps));
        photoContour.push(inner[i].clone().lerp(inner[(i+1)%inner.length],step/steps));
      }
    }
    const rings=[];
    for (let ring=0;ring<=12;ring++) {
      const angle=ring*Math.PI/24,z=halfDepth*Math.sin(angle);
      const front=[],back=[];
      for (let i=0;i<contour.length;i++) {
        const q=photoContour[i].clone().lerp(contour[i],Math.cos(angle));
        front.push(vertex(q,z));back.push(vertex(q,-z));
      }
      rings.push({front,back});
    }
    const add = (a,b,c,front) => indices.push(...(direction*(front?1:-1)>0?[a,b,c]:[a,c,b]));
    for (let ring=0;ring<12;ring++) for (let i=0;i<contour.length;i++) {
      const j=(i+1)%contour.length;
      for (const side of ["front","back"]) {
        const a=rings[ring][side],b=rings[ring+1][side];
        add(a[i],a[j],b[i],side==="front");add(a[j],b[j],b[i],side==="front");
      }
    }
    if (!hollow) {
      // 사진 자리의 평평한 판은 중심 팬이 아닌 Earcut으로 채워 오목한 외곽도 보존한다.
      for (const [a,b,c] of ShapeUtils.triangulateShape(photoContour,[])) {
        const front=rings[12].front,back=rings[12].back;
        const ccw=cross(photoContour[a],photoContour[b],photoContour[c])>0;
        indices.push(...(ccw?[front[a],front[b],front[c]]:[front[a],front[c],front[b]]));
        indices.push(...(ccw?[back[a],back[c],back[b]]:[back[a],back[b],back[c]]));
      }
    } else {
      for (let i=0;i<photoContour.length;i++) {
        const a=photoContour[i],b=photoContour[(i+1)%photoContour.length],start=positions.length/3;
        positions.push(a.x,a.y,halfDepth,b.x,b.y,halfDepth,a.x,a.y,-halfDepth,b.x,b.y,-halfDepth);
        const wall=direction>0?[0,1,2,1,3,2]:[0,2,1,1,2,3];
        indices.push(...wall.map(n=>start+n));
      }
    }
    return finish();
  }
  const face = (a,b,c,flat=false) => {
    const heights=[a,b,c].map(p=>flat?halfDepth:height(p));
    // 좁은 모서리의 세 점이 모두 경계면이면 앞뒤가 겹쳐 법선이 상쇄된다. 내부 점을 하나 넣어 부피를 남긴다.
    if (!flat && Math.max(...heights)<1e-10) {
      const middle=new Vector2((a.x+b.x+c.x)/3,(a.y+b.y+c.y)/3);
      if (height(middle)>1e-10) { face(a,b,middle);face(b,c,middle);face(c,a,middle); }
      return;
    }
    const front=[a,b,c].map((p,i)=>vertex(p,heights[i]));
    const back=[a,b,c].map((p,i)=>vertex(p,-heights[i]));
    // 앞면은 +Z, 뒷면은 -Z를 향한다. 외곽의 공통 점은 법선을 공유해 둥근 옆면을 만든다.
    const ccw=(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x)>0;
    indices.push(...(ccw?front:[front[0],front[2],front[1]]));
    indices.push(...(ccw?[back[0],back[2],back[1]]:back));
  };
  const subdivide = (a,b,c,level,flat=false) => {
    if (!level) { face(a,b,c,flat);return; }
    const ab=new Vector2((a.x+b.x)/2,(a.y+b.y)/2),bc=new Vector2((b.x+c.x)/2,(b.y+c.y)/2),ca=new Vector2((c.x+a.x)/2,(c.y+a.y)/2);
    subdivide(a,ab,ca,level-1,flat);subdivide(ab,b,bc,level-1,flat);
    subdivide(ca,bc,c,level-1,flat);subdivide(ab,bc,ca,level-1,flat);
  };
  // Earcut으로 먼저 나눠 귀/골짜기를 보존한다. 중심점 팬 방식은 오목한 틀 밖을 덮을 수 있어 쓰지 않는다.
  const rimPoints=insetFits?[...outer,...inner]:outer;
  for (const triangle of ShapeUtils.triangulateShape(outer,insetFits?[inner]:[])) {
    subdivide(...triangle.map(i=>rimPoints[i]),3);
  }
  if (insetFits && !hollow) {
    for (const triangle of ShapeUtils.triangulateShape(inner,[])) subdivide(...triangle.map(i=>inner[i]),3,true);
  } else if (hollow) {
    // 빈 틀의 사진 창은 실제 구멍이다. 안쪽 벽은 별도 법선으로 만들어 사진 자리의 경계를 유지한다.
    const clockwise=ShapeUtils.isClockWise(inner);
    for (let i=0;i<inner.length;i++) {
      const from=inner[i],to=inner[(i+1)%inner.length];
      for (let step=0;step<8;step++) {
        const a=from.clone().lerp(to,step/8),b=from.clone().lerp(to,(step+1)/8),start=positions.length/3;
        positions.push(a.x,a.y,halfDepth,b.x,b.y,halfDepth,a.x,a.y,-halfDepth,b.x,b.y,-halfDepth);
        const wall=clockwise?[0,2,1,1,2,3]:[0,1,2,1,3,2];
        indices.push(...wall.map(n=>start+n));
      }
    }
  }
  return finish();
}
