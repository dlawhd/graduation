import { BufferGeometry, Float32BufferAttribute, ShapeUtils, Vector2 } from "three";
import { flatBodyBase } from "./body3DBase.mjs";
import { bodyWorldPoint, body3DProfile, bodyDomeDepth, canExtrudeHollowBody, BODY_3D_DEPTH, BODY_3D_EDGE_DEPTH, BODY_3D_PHOTO_BULGE } from "./body3DGeometry.mjs";

/** 저장 외곽선 안에서 앞뒤 몸통과 사진 면을 함께 부풀린다. 외곽과 사진 경계는 그대로 연결한다. */
export function roundedBodyGeometry(value, hollow = false, profile = body3DProfile(value), timing = null) {
  // 진단 화면만 선택적으로 같은 계산을 계측한다. 저장 좌표·분할 횟수·표면 품질은 바꾸지 않는다.
  const measure=(name,task)=>timing?timing.measure(name,task):task();
  const body = profile;
  if (!body || !body.photoSafe) throw new Error("Unsupported outline");
  const insetFits = canExtrudeHollowBody(body);
  if (hollow && !insetFits) throw new Error("Unsupported outline");
  const outer = body.renderOutline.map(bodyWorldPoint).map(p => new Vector2(p.x, p.y));
  const holes=body.photoContours.map(poly=>poly.map(p=>bodyWorldPoint({x:p.x/480,y:p.y/480})).map(p=>new Vector2(p.x,p.y)));
  const inner=holes[0];
  const halfDepth = BODY_3D_DEPTH / 2;
  const positions = [], indices = [], photoIndices = [], vertices = new Map();
  let photoHeight=null;
  // 사진 배치만 바뀔 때는 다시 만들지 않는다. 저장 96점/3D 곡선 384점, 12개 링 또는 제한된 내부 분할만 사용한다.
  const distance = (p, polygon) => {
    let best = Infinity;
    for (let i=0;i<polygon.length;i++) {
      const a=polygon[i], b=polygon[(i+1)%polygon.length], dx=b.x-a.x, dy=b.y-a.y;
      const t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy)));
      best=Math.min(best,Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy));
    }
    return best;
  };
  let smoothHeight=null;
  const height = p => smoothHeight(p);
  const vertex = (p,z) => {
    const key=`${p.x.toFixed(8)},${p.y.toFixed(8)},${z.toFixed(8)}`;
    if (!vertices.has(key)) {
      vertices.set(key,positions.length/3);positions.push(p.x,p.y,z);
    }
    return vertices.get(key);
  };
  const finish = () => {
    if (!positions.every(Number.isFinite)) throw new Error("Invalid geometry");
    if((indices.length+photoIndices.length)/3>40000) throw new Error("Surface budget exceeded");
    const geometry=new BufferGeometry();
    geometry.setAttribute("position",new Float32BufferAttribute(positions,3));geometry.setIndex([...indices,...photoIndices]);
    geometry.addGroup(0,indices.length,0);
    if(photoIndices.length) geometry.addGroup(indices.length,photoIndices.length,1);
    // 입구도 사진 곡면의 실제 높이에 맞춰 놓는다. 회전 중에는 격자를 다시 계산하지 않는다.
    geometry.userData.photoHeight=photoHeight;
    // 앞뒤 모두 같은 그림판 좌표를 사용한다. 실제 뒤 회전에서 색 배치도 자연스럽게 반전된다.
    const uv=new Float32Array(positions.length/3*2);
    for(let i=0,j=0;i<positions.length;i+=3) {uv[j++]=(positions[i]+1)/2;uv[j++]=(positions[i+1]+1)/2;}
    geometry.setAttribute("uv",new Float32BufferAttribute(uv,2));
    geometry.computeBoundingBox();
    // 2D 저장 외곽은 그대로 둔다. 법선/구는 바닥을 닫은 뒤 한 번만 계산하고 중간 geometry도 정리한다.
    try {return measure("flatBase",()=>flatBodyBase(geometry,holes));} finally {geometry.dispose();}
  };
  const center=bodyWorldPoint({x:(body.window.x+body.window.width/2)/480,y:(body.window.y+body.window.height/2)/480});
  const cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
  const direction=ShapeUtils.isClockWise(outer)?-1:1;
  /** 사진 면도 내부 정점으로 나눠 앞뒤 대칭으로 부풀린다. 구멍의 XY 경계/사진 UV는 움직이지 않는다. */
  function addPhotoCaps(polygons) {
    photoHeight=measure("photoHeightField",()=>photoDomeField(holes,distance));
    for(const polygon of polygons) {
      const cap=measure("photoTessellation",()=>tessellateSurface(polygon,ShapeUtils.triangulateShape(polygon,[])));
      // 같은 정점을 여러 삼각형과 앞/뒷면이 공유한다. 비싼 경계 거리/높이와 정점 키 계산은 한 번만 한다.
      // 좌표를 반올림해 묶지 않고 분할기의 정점 번호를 쓰므로 가까운 서로 다른 점은 합쳐지지 않는다.
      // 캐시는 이 사진 면 생성 중에만 쓰고 버려서 사진 교체·다른 틀·회전 이후에 오래된 값이 남지 않는다.
      const heights=new Float64Array(cap.points.length),ready=new Uint8Array(cap.points.length);
      const frontVertices=new Uint32Array(cap.points.length),backVertices=new Uint32Array(cap.points.length);
      measure("photoSurfaceVertices",()=>{for(const triangle of cap.triangles) {
        // 기존과 같은 '삼각형 앞면 전체 → 뒷면 전체' 순서로 등록해 정점/인덱스 바이트도 유지한다.
        for(const i of triangle) if(!(ready[i]&1)) {
          heights[i]=photoHeight(cap.points[i]);frontVertices[i]=vertex(cap.points[i],heights[i]);ready[i]|=1;
        }
        for(const i of triangle) if(!(ready[i]&2)) {
          backVertices[i]=vertex(cap.points[i],-heights[i]);ready[i]|=2;
        }
        const [a,b,c]=triangle,ccw=cross(cap.points[a],cap.points[b],cap.points[c])>0;
        if(ccw)photoIndices.push(frontVertices[a],frontVertices[b],frontVertices[c],backVertices[a],backVertices[c],backVertices[b]);
        else photoIndices.push(frontVertices[a],frontVertices[c],frontVertices[b],backVertices[a],backVertices[b],backVertices[c]);
      }});
    }
  }
  /** 넓은 옆벽 대신 앞뒤 곡면 사이에 아주 얇은 연결 띠만 만든다. 빈 틀도 외부 옆면은 닫아 준다. */
  const joinEdge = contour => {
    const halfEdge=BODY_3D_EDGE_DEPTH/2;
    for (let i=0;i<contour.length;i++) {
      const a=contour[i],b=contour[(i+1)%contour.length];
      const frontA=vertex(a,halfEdge),frontB=vertex(b,halfEdge),backA=vertex(a,-halfEdge),backB=vertex(b,-halfEdge);
      const wall=direction>0?[frontA,backA,frontB,frontB,backA,backB]:[frontA,frontB,backA,frontB,backB,backA];
      indices.push(...wall);
    }
  };
  // 중심을 향해 줄여도 선이 접히지 않는 틀은 일정한 곡률의 링으로 만든다. 귀/볼이 매끈하게 이어진다.
  const ringSafe=holes.length===1 && body.photoMode==="OUTLINE" && outer.length===inner.length && insetFits
    && outer.every((a,i)=>direction*cross(a,outer[(i+1)%outer.length],center)>1e-10
      && direction*cross(a,outer[(i+1)%outer.length],inner[i])>0
      && direction*cross(outer[(i+1)%outer.length],inner[(i+1)%inner.length],inner[i])>0);
  if (ringSafe) {
    const contour=[],photoContour=[];
    for (let i=0;i<outer.length;i++) {
      const a=outer[i],b=outer[(i+1)%outer.length],steps=Math.min(2,Math.max(1,Math.ceil(a.distanceTo(b)/.04)));
      for (let step=0;step<steps;step++) {
        contour.push(a.clone().lerp(b,step/steps));
        photoContour.push(inner[i].clone().lerp(inner[(i+1)%inner.length],step/steps));
      }
    }
    const rings=[];
    for (let ring=0;ring<=12;ring++) {
      const progress=ring/12,z=bodyDomeDepth(progress);
      const front=[],back=[];
      for (let i=0;i<contour.length;i++) {
        // 테두리 근처에서 깊이가 급하게 솟던 코사인 이동 대신 곡면의 폭을 균일하게 나눈다.
        const q=contour[i].clone().lerp(photoContour[i],progress);
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
      // Earcut 경계는 유지하되 내부 면을 둥글게 부풀리는 방식으로 확장한다.
      addPhotoCaps([photoContour]);
    } else {
      for (let i=0;i<photoContour.length;i++) {
        const a=photoContour[i],b=photoContour[(i+1)%photoContour.length],start=positions.length/3;
        positions.push(a.x,a.y,halfDepth,b.x,b.y,halfDepth,a.x,a.y,-halfDepth,b.x,b.y,-halfDepth);
        const wall=direction>0?[0,1,2,1,3,2]:[0,2,1,1,2,3];
        indices.push(...wall.map(n=>start+n));
      }
    }
    joinEdge(contour);
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
  // Earcut으로 먼저 나눠 귀/골짜기를 보존한다. 중심점 팬 방식은 오목한 틀 밖을 덮을 수 있어 쓰지 않는다.
  const rimPoints=[...outer,...holes.flat()];
  const rimTriangles=ShapeUtils.triangulateShape(outer,holes);
  smoothHeight=measure("rimHeightField",()=>smoothedDomeField(outer,holes,distance));
  // 긴 삼각형을 그대로 등분하면 가는 팔다리에 주름이 생긴다. 경계는 고정하고 내부 대각선을 다듬는다.
  const surface=measure("rimTessellation",()=>tessellateSurface(rimPoints,rimTriangles));
  measure("rimSurfaceVertices",()=>{for (const triangle of surface.triangles) face(...triangle.map(i=>surface.points[i]));});
  if (insetFits && !hollow) {
    addPhotoCaps(holes);
  } else if (hollow) {
    // 빈 틀의 사진 창은 실제 구멍이다. 안쪽 벽은 별도 법선으로 만들어 사진 자리의 경계를 유지한다.
    for (const [from,to] of surface.boundaries) {
      const a=surface.points[from],b=surface.points[to];
      if(distance(a,outer)<1e-7 && distance(b,outer)<1e-7) continue;
      {
        const start=positions.length/3;
        positions.push(a.x,a.y,halfDepth,b.x,b.y,halfDepth,a.x,a.y,-halfDepth,b.x,b.y,-halfDepth);
        // 경계는 앞면의 반시계 방향이다. 구멍 경계는 시계 방향이므로 안쪽을 향한다.
        const wall=[0,2,1,1,2,3];
        indices.push(...wall.map(n=>start+n));
      }
    }
  }
  // 삼각형 분할의 실제 바깥 변으로 연결해 오목한 틀에도 옆면 틈을 남기지 않는다.
  for(const [a,b] of surface.boundaries) {
    const from=surface.points[a],to=surface.points[b];
    if(distance(from,outer)<1e-7 && distance(to,outer)<1e-7) {
      const halfEdge=BODY_3D_EDGE_DEPTH/2;
      indices.push(vertex(from,halfEdge),vertex(from,-halfEdge),vertex(to,halfEdge),
        vertex(to,halfEdge),vertex(from,-halfEdge),vertex(to,-halfEdge));
    }
  }
  return finish();
}

/** 사진 창마다 경계는 고정하고 안쪽 높이를 부드럽게 푼다. 깊은 골짜기를 막거나 좁은 가지를 과도하게 부풀리지 않는다. */
export function photoDomeField(holes,distance) {
  const size=129,step=2/(size-1),count=size*size,inside=new Uint8Array(count);
  const contains=(p,poly)=>{
    let result=false;
    for(let i=0,j=poly.length-1;i<poly.length;j=i++) {
      const a=poly[i],b=poly[j];
      if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)result=!result;
    }return result;
  };
  for(let y=1;y<size-1;y++)for(let x=1;x<size-1;x++)
    inside[y*size+x]=holes.some(poly=>contains({x:x*step-1,y:y*step-1},poly))?1:0;
  let values=new Float64Array(count),next=new Float64Array(count);
  // 고정 횟수와 129×129 격자로 CPU/메모리를 제한한다. 최소 거리만 사용하면 중앙에 생기는 능선을 피한다.
  for(let pass=0;pass<160;pass++) {
    for(let y=1;y<size-1;y++)for(let x=1;x<size-1;x++) {
      const i=y*size+x;
      next[i]=inside[i]?(values[i-1]+values[i+1]+values[i-size]+values[i+size])/4+step*step:0;
    }
    [values,next]=[next,values];
  }
  const peak=values.reduce((a,b)=>Math.max(a,b),0);
  return p=>{
    const edge=Math.min(...holes.map(poly=>distance(p,poly)));
    if(edge<1e-8||!holes.some(poly=>contains(p,poly))||!peak)return BODY_3D_DEPTH/2;
    const x=Math.max(0,Math.min(size-1.000001,(p.x+1)/step)),y=Math.max(0,Math.min(size-1.000001,(p.y+1)/step));
    const ix=Math.floor(x),iy=Math.floor(y),tx=x-ix,ty=y-iy,i=iy*size+ix;
    let t=((values[i]*(1-tx)+values[i+1]*tx)*(1-ty)+(values[i+size]*(1-tx)+values[i+size+1]*tx)*ty)/peak;
    if(edge<step) t*=Math.sin(edge/step*Math.PI/2)**2;
    t=Math.max(0,Math.min(1,t));
    return BODY_3D_DEPTH/2+BODY_3D_PHOTO_BULGE*t*t*(3-2*t);
  };
}

/** 균일한 격자에서 높이를 보정해 삼각형의 길이/방향이 표면의 주름으로 나타나지 않게 한다. 경계와 사진 판은 고정한다. */
export function smoothedDomeField(outer,inner,distance) {
  const holes=Array.isArray(inner[0])?inner:[inner];
  const photoDistance=p=>Math.min(...holes.map(poly=>distance(p,poly)));
  const size=129,step=2/(size-1),count=size*size;
  const inside=(p,polygon)=>{
    let result=false;
    for(let i=0,j=polygon.length-1;i<polygon.length;j=i++) {
      const a=polygon[i],b=polygon[j];
      if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x) result=!result;
    }return result;
  };
  const initial=new Float64Array(count),fixed=new Uint8Array(count);
  for(let y=0;y<size;y++) for(let x=0;x<size;x++) {
    const i=y*size+x,p={x:x*step-1,y:y*step-1};
    if(!inside(p,outer)) fixed[i]=1;
    else if(holes.some(poly=>inside(p,poly))) {initial[i]=1;fixed[i]=1;}
    else {
      // 깊은 오목한 틀도 외곽까지의 거리로 안전하게 부푼다. 사진 창은 먼저 몸통 안에 보정되어 있다.
      const edge=distance(p,outer);initial[i]=edge/Math.max(edge+photoDistance(p),1e-12);
    }
  }
  let values=initial.slice(),next=values.slice();
  for(let pass=0;pass<96;pass++) {
    for(let y=1;y<size-1;y++) for(let x=1;x<size-1;x++) {
      const i=y*size+x;
      next[i]=fixed[i]?initial[i]:initial[i]*.02+values[i]*.18+(values[i-1]+values[i+1]+values[i-size]+values[i+size])*.2;
    }
    [values,next]=[next,values];
  }
  return p=>{
    const x=Math.max(0,Math.min(size-1.000001,(p.x+1)/step)),y=Math.max(0,Math.min(size-1.000001,(p.y+1)/step));
    const ix=Math.floor(x),iy=Math.floor(y),tx=x-ix,ty=y-iy,i=iy*size+ix;
    let progress=(values[i]*(1-tx)+values[i+1]*tx)*(1-ty)+(values[i+size]*(1-tx)+values[i+size+1]*tx)*ty;
    const edge=distance(p,outer),photo=photoDistance(p);
    // 격자와 실제 외곽의 오차는 한 칸 안에서만 보정한다. 정확한 경계는 언제나 같은 높이에 남긴다.
    if(edge<step && photo<step) {
      // 얇은 테두리에서는 두 경계 보정이 겹친다. 거리 비율로 연결해 바깥 변이 옆벽에서 들뜨지 않게 한다.
      progress=edge/Math.max(edge+photo,1e-12);
    } else {
      if(edge<step) {const t=edge/step;progress*=t*(2-t);}
      if(photo<step) {const t=photo/step;progress=1-(1-progress)*t*(2-t);}
    }
    return bodyDomeDepth(progress);
  };
}

/** 삼각형의 긴 변을 함께 나누고 내부 대각선만 바꾼다. 외곽/구멍 경계와 오목한 골짜기는 그대로 보존한다. */
function tessellateSurface(source,faces) {
  const points=source.map(p=>p.clone()),cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
  let triangles=faces.map(([a,b,c])=>cross(points[a],points[b],points[c])>0?[a,b,c]:[a,c,b]);
  const key=(a,b)=>a<b?`${a},${b}`:`${b},${a}`;
  const edges=()=>{
    const result=new Map();
    triangles.forEach((t,i)=>t.forEach((a,j)=>{
      const b=t[(j+1)%3],c=t[(j+2)%3],id=key(a,b);
      if(!result.has(id)) result.set(id,[]);result.get(id).push({a,b,c,i});
    }));return result;
  };
  const improve=()=>{
    // 경계는 인접 삼각형이 하나뿐이므로 이동하지 않는다. 같은 패스의 정점을 중복 교체하지 않는다.
    for(let pass=0;pass<8;pass++) {
      const used=new Set();let changed=false;
      for(const adjacent of edges().values()) {
        if(adjacent.length!==2) continue;
        const [first,second]=adjacent,{a,b,c,i}=first,d=second.c,j=second.i;
        if(used.has(i)||used.has(j)) continue;
        const pa=points[a],pb=points[b],pc=points[c],pd=points[d];
        if(cross(pc,pa,pd)<=1e-12 || cross(pc,pd,pb)<=1e-12) continue;
        const ax=pa.x-pd.x,ay=pa.y-pd.y,bx=pb.x-pd.x,by=pb.y-pd.y,cx=pc.x-pd.x,cy=pc.y-pd.y;
        const inCircle=(ax*ax+ay*ay)*(bx*cy-by*cx)-(bx*bx+by*by)*(ax*cy-ay*cx)+(cx*cx+cy*cy)*(ax*by-ay*bx);
        if(inCircle<=1e-12) continue;
        triangles[i]=[c,a,d];triangles[j]=[c,d,b];used.add(i);used.add(j);changed=true;
      }
      if(!changed) break;
    }
  };
  improve();
  for(let round=0;round<7;round++) {
    const midpoints=new Map();
    for(const [id,[edge]] of edges()) {
      const a=points[edge.a],b=points[edge.b];
      if(a.distanceTo(b)>.035) { midpoints.set(id,points.length);points.push(a.clone().lerp(b,.5)); }
    }
    if(!midpoints.size) break;
    const refined=[];
    for(const t of triangles) {
      const mid=t.map((a,i)=>midpoints.get(key(a,t[(i+1)%3]))),count=mid.filter(n=>n!==undefined).length;
      if(count===0) refined.push(t);
      else if(count===3) {
        const [a,b,c]=t,[ab,bc,ca]=mid;refined.push([a,ab,ca],[ab,b,bc],[ca,bc,c],[ab,bc,ca]);
      } else {
        // 변 하나 또는 두 개를 나눌 때도 이웃과 같은 중간 점을 사용해 틈/T자 접합을 만들지 않는다.
        const start=count===1?mid.findIndex(n=>n!==undefined):(mid.findIndex(n=>n===undefined)+1)%3;
        const a=t[start],b=t[(start+1)%3],c=t[(start+2)%3],ab=mid[start],bc=mid[(start+1)%3];
        if(count===1) refined.push([a,ab,c],[ab,b,c]);
        else {
          refined.push([ab,b,bc]);
          if(points[a].distanceTo(points[bc])<points[ab].distanceTo(points[c])) refined.push([a,ab,bc],[a,bc,c]);
          else refined.push([a,ab,c],[ab,bc,c]);
        }
      }
    }
    // 비정상적으로 복잡한 모델이 UI를 장시간 막지 않도록 한 면의 계산량에 상한을 둔다.
    if(refined.length>16000) throw new Error("Surface budget exceeded");
    triangles=refined;improve();
  }
  return {points,triangles,boundaries:[...edges().values()].filter(list=>list.length===1).map(([edge])=>[edge.a,edge.b])};
}
