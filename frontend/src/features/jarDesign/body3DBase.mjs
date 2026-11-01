import { BufferGeometry, Float32BufferAttribute, ShapeUtils, Vector2 } from "three";

/** 그림/사진을 고치지 않고 3D 몸통의 최하단만 수평으로 잘라 닫는다. 떨어진 발 사이를 임의로 메우지 않는다. */
export function flatBodyBase(source, photoContours) {
  const box=source.boundingBox, height=box.max.y-box.min.y;
  const photoBottom=Math.min(...photoContours.flat().map(p=>p.y));
  // 전체 높이의 3.5%까지만 다듬고 사진 창과의 간격 절반은 남긴다. 사진 UV/경계는 절대로 자르지 않는다.
  const trim=Math.min(height*.035,(photoBottom-box.min.y)*.5);
  if(!Number.isFinite(trim)||trim<=1e-6)throw new Error("Unsupported flat base");
  // 절단면이 기존 정점에 정확히 걸리면 아주 조금 옮겨 퇴화한 교차선을 피한다. 재시도 횟수는 고정한다.
  for(let attempt=0;attempt<3;attempt++) {
    try {return clipAndClose(source,box.min.y+trim-attempt*trim*.001,trim);}
    catch(error) {if(attempt===2)throw error;}
  }
}

/** 삼각형을 자른 뒤 실제 교차선을 따라 각각의 바닥 면을 만든다. 사각형/볼록 껍질 대체는 사용하지 않는다. */
function clipAndClose(source, plane, trim) {
  const position=source.attributes.position,sourceIndex=source.index;
  const positions=[],indices=[[],[]],vertexMap=new Map(),nodes=[],buckets=new Map(),edges=new Map();
  const epsilon=1e-6;
  // 여러 삼각형이 같은 원본 정점을 공유한다. 읽기/Float32 변환/좌표 키 생성은 정점마다 한 번만 한다.
  // 이 절단 호출 안에서만 보관하며 원본 BufferAttribute나 사진 데이터는 변경하지 않는다.
  const sourcePoints=new Array(position.count),bodyVertices=new WeakMap(),baseVertices=new WeakMap();
  const point=i=>sourcePoints[i]??(sourcePoints[i]={x:position.getX(i),y:position.getY(i),z:position.getZ(i)});
  const vertex=(p,base=false)=>{
    // 바닥은 몸통과 좌표가 같아도 법선을 분리해야 한다. 두 번호 캐시는 섞지 않는다.
    const cached=base?baseVertices:bodyVertices,known=cached.get(p);
    if(known!==undefined)return known;
    const coordinates=[p.x,p.y,p.z].map(Math.fround),key=`${base?"base":"body"}:${coordinates.join(",")}`;
    if(!vertexMap.has(key)){vertexMap.set(key,positions.length/3);positions.push(...coordinates);}
    const index=vertexMap.get(key);cached.set(p,index);return index;
  };
  // 같은 교차점이 계산 순서에 따라 미세하게 달라도 닫힌 고리가 되도록 가까운 점을 공유한다.
  const cutNode=p=>{
    const x=Math.floor(p.x/epsilon),z=Math.floor(p.z/epsilon);
    for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++)
      for(const i of buckets.get(`${x+dx},${z+dz}`)||[]) {
        if(Math.hypot(nodes[i].x-p.x,nodes[i].z-p.z)<epsilon)return i;
      }
    const id=nodes.length;nodes.push({x:Math.fround(p.x),y:plane,z:Math.fround(p.z)});
    const key=`${x},${z}`;if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(id);
    return id;
  };
  const crossArea=(a,b,c)=>{
    const ux=b.x-a.x,uy=b.y-a.y,uz=b.z-a.z,vx=c.x-a.x,vy=c.y-a.y,vz=c.z-a.z;
    return Math.hypot(uy*vz-uz*vy,uz*vx-ux*vz,ux*vy-uy*vx);
  };
  for(const group of source.groups)for(let offset=group.start;offset<group.start+group.count;offset+=3) {
    const a=point(sourceIndex.getX(offset)),b=point(sourceIndex.getX(offset+1)),c=point(sourceIndex.getX(offset+2));
    // 바닥과 만나지 않는 대다수의 면은 절단할 필요가 없다. 면 순서와 퇴화 면 제외 기준은 그대로다.
    if(a.y>=plane&&b.y>=plane&&c.y>=plane) {
      if(crossArea(a,b,c)>=1e-13)indices[group.materialIndex].push(vertex(a),vertex(b),vertex(c));
      continue;
    }
    if(a.y<plane&&b.y<plane&&c.y<plane)continue;
    const triangle=[a,b,c],clipped=[];
    const below=triangle.some(p=>p.y<plane);
    for(let j=0;j<3;j++) {
      const a=triangle[j],b=triangle[(j+1)%3],inside=a.y>=plane,nextInside=b.y>=plane;
      if(inside)clipped.push(a);
      if(inside!==nextInside) {
        const t=(plane-a.y)/(b.y-a.y),id=cutNode({x:a.x+t*(b.x-a.x),z:a.z+t*(b.z-a.z)});
        clipped.push(nodes[id]);
      }
    }
    let hasFace=false;
    for(let j=1;j+1<clipped.length;j++) {
      const face=[clipped[0],clipped[j],clipped[j+1]];
      if(crossArea(...face)<1e-13)continue;
      indices[group.materialIndex].push(...face.map(p=>vertex(p)));hasFace=true;
    }
    if(below&&hasFace) {
      const cuts=[...new Set(clipped.filter(p=>Math.abs(p.y-plane)<1e-10).map(cutNode))];
      if(cuts.length===2&&cuts[0]!==cuts[1]) {
        const [a,b]=cuts.sort((a,b)=>a-b);edges.set(`${a},${b}`,[a,b]);
      } else if(cuts.length!==0)throw new Error("Ambiguous flat base intersection");
    }
  }
  const neighbors=new Map();
  for(const [a,b] of edges.values())for(const [from,to] of [[a,b],[b,a]]) {
    if(!neighbors.has(from))neighbors.set(from,new Set());neighbors.get(from).add(to);
  }
  if(!neighbors.size||[...neighbors.values()].some(list=>list.size!==2))throw new Error("Unclosed flat base");
  const visited=new Set(),loops=[];
  for(const start of neighbors.keys()) {
    if(visited.has(start))continue;
    const loop=[];let current=start,previous=-1;
    do {
      if(visited.has(current)||loop.length>nodes.length)throw new Error("Invalid flat base loop");
      visited.add(current);loop.push(nodes[current]);
      const next=[...neighbors.get(current)].find(i=>i!==previous);previous=current;current=next;
    }while(current!==start);
    if(loop.length<3)throw new Error("Empty flat base");loops.push(loop);
  }
  const capStart=indices[0].length;
  for(const loop of loops) {
    const polygon=loop.map(p=>new Vector2(p.x,p.z)),faces=ShapeUtils.triangulateShape(polygon,[]);
    const expectedArea=Math.abs(ShapeUtils.area(polygon));let actualArea=0;
    for(const face of faces) {
      const [a,b,c]=face.map(i=>loop[i]),cross=(b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x);
      if(Math.abs(cross)<1e-12)continue; // 일직선인 절단 점 세 개는 면이 아니므로 영벡터 법선을 만들지 않는다.
      actualArea+=Math.abs(cross)/2;
      // XZ 반시계 면의 법선은 아래(-Y)를 향한다. 바닥 정점은 분리해 곡면 법선과 섞이지 않는다.
      indices[0].push(...(cross>0?[a,b,c]:[a,c,b]).map(p=>vertex(p,true)));
    }
    if(expectedArea<1e-10||Math.abs(actualArea-expectedArea)>Math.max(1e-8,expectedArea*.001))
      throw new Error("Incomplete flat base");
  }
  if((indices[0].length+indices[1].length)/3>40000)throw new Error("Surface budget exceeded");
  const geometry=new BufferGeometry();
  geometry.setAttribute("position",new Float32BufferAttribute(positions,3));geometry.setIndex([...indices[0],...indices[1]]);
  geometry.addGroup(0,indices[0].length,0);if(indices[1].length)geometry.addGroup(indices[0].length,indices[1].length,1);
  const uv=[];for(let i=0;i<positions.length;i+=3)uv.push((positions[i]+1)/2,(positions[i+1]+1)/2);
  geometry.setAttribute("uv",new Float32BufferAttribute(uv,2));
  geometry.userData={...source.userData,flatBase:{plane,trim,loops,capStart,capCount:indices[0].length-capStart}};
  geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();
  return geometry;
}
