/** 틀 안의 실제 사진 공간을 픽셀 마스크로 구하고 제한된 좌표로 바꾼다. 좁은 부분은 사진 창이 아닌 테두리로 남긴다. */
export function insideContour(p,polygon) {
  let result=false;
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++) {
    const a=polygon[i],b=polygon[j];
    if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x) result=!result;
  }return result;
}
const cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
const intersects=(a,b,c,d)=>Math.max(a.x,b.x)>=Math.min(c.x,d.x)&&Math.max(c.x,d.x)>=Math.min(a.x,b.x)
  &&Math.max(a.y,b.y)>=Math.min(c.y,d.y)&&Math.max(c.y,d.y)>=Math.min(a.y,b.y)
  &&cross(a,b,c)*cross(a,b,d)<=0&&cross(c,d,a)*cross(c,d,b)<=0;

/** 사진 창의 선/점/개수/상호 겹침을 먼저 확인해 유효하지 않은 경계가 렌더러에 들어가지 않게 한다. */
export function contoursFit(outer,contours) {
  if(!Array.isArray(contours)||!contours.length||contours.length>8||contours.some(p=>!Array.isArray(p)||p.length<3||p.length>96)
    ||contours.reduce((n,p)=>n+p.length,0)>384) return false;
  if(contours.some(p=>p.some(q=>!q||![q.x,q.y].every(n=>Number.isFinite(n)&&n>=.05&&n<=.95)))) return false;
  for(let k=0;k<contours.length;k++) {
    const poly=contours[k];let area=0;
    for(let i=0;i<poly.length;i++) {
      const a=poly[i],b=poly[(i+1)%poly.length];
      if(!insideContour(a,outer)||Math.hypot(a.x-b.x,a.y-b.y)<.0001) return false;
      area+=a.x*b.y-b.x*a.y;
      for(let j=0;j<outer.length;j++) if(intersects(a,b,outer[j],outer[(j+1)%outer.length])) return false;
      for(let j=i+2;j<poly.length;j++) {
        if(i===0&&j===poly.length-1) continue;
        if(intersects(a,b,poly[j],poly[(j+1)%poly.length])) return false;
      }
      for(let j=0;j<k;j++) {
        const other=contours[j];
        if(insideContour(a,other)||insideContour(other[0],poly)) return false;
        for(let e=0;e<other.length;e++) if(intersects(a,b,other[e],other[(e+1)%other.length])) return false;
      }
    }
    if(Math.abs(area)<.00002) return false;
  }return true;
}

/** 닫힌 선을 두 경로로 나눠 반복 처리해 깊은 재귀 호출 없이 경계를 단순화한다. */
export function simplifyContour(points,tolerance) {
  let split=1,farthest=0;
  for(let i=1;i<points.length;i++) {const d=(points[i].x-points[0].x)**2+(points[i].y-points[0].y)**2;if(d>farthest){split=i;farthest=d;}}
  const simplify=chain=>{
    const keep=new Uint8Array(chain.length);keep[0]=keep[chain.length-1]=1;const stack=[[0,chain.length-1]];
    while(stack.length) {
      const [from,to]=stack.pop(),a=chain[from],b=chain[to],dx=b.x-a.x,dy=b.y-a.y,length=dx*dx+dy*dy;let index=-1,largest=tolerance*tolerance;
      for(let i=from+1;i<to;i++) {const p=chain[i],t=length?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/length)):0;
        const d=(p.x-a.x-t*dx)**2+(p.y-a.y-t*dy)**2;if(d>largest){index=i;largest=d;}}
      if(index>=0){keep[index]=1;stack.push([from,index],[index,to]);}
    }return chain.filter((_,i)=>keep[i]);
  };
  return [...simplify(points.slice(0,split+1)).slice(0,-1),...simplify([...points.slice(split),points[0]]).slice(0,-1)];
}

/** 픽셀 행과 거리 마스크로 경계를 안쪽으로 옮긴다. 사진 비율에 맞춰 사각형으로 바꾸지 않는다. */
export function insetBodyContours(points,ink=null) {
  if(!Array.isArray(points)||points.length<3||points.length>96
    ||points.some(p=>!p||![p.x,p.y].every(n=>Number.isFinite(n)&&n>=.05&&n<=.95))) return [];
  const size=480,count=size*size,mask=new Uint8Array(count);
  for(let y=24;y<456;y++) {
    const hits=[],scan=(y+.5)/size;
    for(let i=0;i<points.length;i++) {const a=points[i],b=points[(i+1)%points.length];if((a.y>scan)!==(b.y>scan))hits.push((a.x+(b.x-a.x)*(scan-a.y)/(b.y-a.y))*size);}
    hits.sort((a,b)=>a-b);
    for(let i=0;i+1<hits.length;i+=2) for(let x=Math.ceil(hits[i]-.5);x<hits[i+1]-.5;x++) mask[y*size+x]=1;
  }
  const blank=ink&&ink.length===count*4?mask.reduce((n,v,i)=>n+(v&&ink[i*4+3]<48?1:0),0):0;
  const painted=blank>480;
  if(painted) for(let i=0;i<count;i++) if(ink[i*4+3]>=48) mask[i]=0;
  const distances=new Uint16Array(count),queue=new Int32Array(count);let head=0,tail=0;
  for(let i=0;i<count;i++) {if(!mask[i])queue[tail++]=i;else distances[i]=65535;}
  while(head<tail) {
    const p=queue[head++];
    for(const q of [p-size,p+size,...(p%size?[p-1]:[]),...(p%size<size-1?[p+1]:[])])
      if(q>=0&&q<count&&distances[q]>distances[p]+1) {distances[q]=distances[p]+1;queue[tail++]=q;}
  }
  for(const inset of painted?[4,6,8]:[12,16,20]) {
    const edges=new Map(),stride=size+1;let ambiguous=false;
    const edge=(x,y,nx,ny)=>{const from=y*stride+x;if(edges.has(from))ambiguous=true;edges.set(from,ny*stride+nx);};
    for(let y=24;y<456;y++) for(let x=24;x<456;x++) {
      const p=y*size+x;if(distances[p]<inset)continue;
      if(distances[p-size]<inset)edge(x,y,x+1,y);if(distances[p+1]<inset)edge(x+1,y,x+1,y+1);
      if(distances[p+size]<inset)edge(x+1,y+1,x,y+1);if(distances[p-1]<inset)edge(x,y+1,x,y);
    }
    if(ambiguous)continue;
    const contours=[];let invalid=false;
    while(edges.size&&contours.length<=8) {
      const start=edges.keys().next().value,path=[];let at=start;
      do {path.push({x:at%stride,y:Math.floor(at/stride)});const next=edges.get(at);edges.delete(at);at=next;if(at===undefined){invalid=true;break;}} while(at!==start);
      if(invalid)break;
      const turns=path.filter((b,i)=>{const a=path[(i+path.length-1)%path.length],c=path[(i+1)%path.length];return cross(a,b,c)!==0;});
      let reduced=null;
      // 1px 계단을 그대로 입체 벽으로 만들지 않는다. 4px 이상 안전 여백 안에서 최대 2.5px만 근사한다.
      for(const tolerance of [1.5,2,2.5]) {const p=simplifyContour(turns,tolerance);if(p.length>=3&&p.length<=96){reduced=p;break;}}
      if(!reduced){invalid=true;break;}
      const area=Math.abs(reduced.reduce((n,a,i)=>{const b=reduced[(i+1)%reduced.length];return n+a.x*b.y-b.x*a.y;},0));
      if(area<16)continue;
      contours.push(reduced.map(p=>({x:Math.round(p.x/size*1e5)/1e5,y:Math.round(p.y/size*1e5)/1e5})));
    }
    if(!invalid&&edges.size===0&&contoursFit(points,contours)) return contours;
  }
  return [];
}
