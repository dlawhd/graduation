import {BufferGeometry,Float32BufferAttribute,Mesh,MeshStandardMaterial,ShapeGeometry} from "three";
import {SVGLoader} from "three/addons/loaders/SVGLoader.js";
import {insideContour} from "./bodyContours.mjs";

/** SVG 장식이 본체 바깥까지 나오는지 검사한다. 점 근사 오차만으로 내부 눈/입까지 중복 생성하지 않는다. */
export function decorationOutside(points,outline,strokeWidth=0) {
  return points.some(p=>{
    const q={x:p.x/480,y:p.y/480};
    if(insideContour(q,outline))return false;
    let nearest=Infinity;
    for(let i=0;i<outline.length;i++){
      const a=outline[i],b=outline[(i+1)%outline.length],dx=b.x-a.x,dy=b.y-a.y;
      const t=Math.max(0,Math.min(1,((q.x-a.x)*dx+(q.y-a.y)*dy)/(dx*dx+dy*dy)));
      nearest=Math.min(nearest,Math.hypot(q.x-a.x-t*dx,q.y-a.y-t*dy)*480);
    }
    return nearest>Math.max(1.5,strokeWidth/8);
  });
}

/** 뿔에 붙은 소품은 뿔의 깊이와 겹치게 배치해 옆면에서 틈이 생기지 않게 한다. */
export function decorationPlacement(layer,attachment) {
  if(attachment==="antler")return {center:.025,depth:.10};
  return {center:layer==="back"?-.025:.105,depth:.08};
}

/** SVG의 채움/선 삼각형을 앞·뒤·닫힌 옆벽이 있는 부품으로 바꾼다. XY/UV는 원래 480 좌표다. */
export function solidDecoration(flat,center=.105,depth=.08) {
  const source=flat.attributes.position,triangles=flat.index?.array||Array.from({length:source.count},(_,i)=>i);
  const points=[],lookup=new Map(),faces=[],edges=new Map();
  const vertex=i=>{
    const x=source.getX(i),y=source.getY(i),key=`${x.toFixed(5)},${y.toFixed(5)}`;
    if(!lookup.has(key)){lookup.set(key,points.length);points.push({x,y});}return lookup.get(key);
  };
  for(let i=0;i<triangles.length;i+=3){
    const tri=[vertex(triangles[i]),vertex(triangles[i+1]),vertex(triangles[i+2])], [a,b,c]=tri.map(j=>points[j]);
    const cross=(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
    if(Math.abs(cross)<1e-8)continue;
    // SVG는 아래쪽이 +Y이므로 3D 변환 뒤 정면 법선이 +Z가 되도록 순서를 뒤집는다.
    if(cross>0)tri.reverse();faces.push(tri);
    tri.forEach((a,j)=>{const b=tri[(j+1)%3],key=a<b?`${a}:${b}`:`${b}:${a}`;const edge=edges.get(key);if(edge)edge.count++;else edges.set(key,{a,b,count:1});});
  }
  if(points.length>24000)throw new Error("Decoration geometry budget exceeded");
  const positions=[],uv=[],indices=[],walls=[],n=points.length;
  for(const z of [center+depth/2,center-depth/2])for(const p of points){positions.push((p.x-240)/240,(240-p.y)/240,z);uv.push(p.x/480,1-p.y/480);}
  for(const [a,b,c] of faces)indices.push(a,b,c,c+n,b+n,a+n);
  for(const {a,b,count} of edges.values())if(count===1)walls.push(a,a+n,b,b,a+n,b+n);
  const geometry=new BufferGeometry();geometry.setAttribute("position",new Float32BufferAttribute(positions,3));
  geometry.setAttribute("uv",new Float32BufferAttribute(uv,2));geometry.setIndex([...indices,...walls]);
  geometry.addGroup(0,indices.length,0);geometry.addGroup(indices.length,walls.length,1);
  geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();return geometry;
}

/** 모든 캐릭터의 원래 장식 SVG를 읽어 외부 소품을 독립 입체 부품으로 만든다. 임의 사용자 SVG는 받지 않는다. */
export function addPreparedBodyDecorations(group,body,value,texture) {
  const resources=[],objects=[];
  const cleanup=()=>{objects.forEach(object=>group.remove(object));resources.forEach(resource=>resource.dispose());};
  try {
    if(!value.decorationSvg)return Object.assign(cleanup,{count:0});
    const paths=new SVGLoader().parse(value.decorationSvg).paths;
    for(const path of paths){
      const style=path.userData.style,layer=path.userData.node.closest("[data-body-decoration]")?.getAttribute("data-body-decoration");
      if(!layer)continue;
      const attachment=path.userData.node.closest("[data-body-attachment]")?.getAttribute("data-body-attachment");
      const placement=decorationPlacement(layer,attachment);
      const points=path.subPaths.flatMap(part=>part.getPoints(16));
      if(!decorationOutside(points,value.points,style.strokeWidth||0))continue;
      const flats=[];
      if(style.fill!=="none"&&style.fillOpacity!==0)for(const shape of path.toShapes())flats.push(new ShapeGeometry(shape,16));
      if(style.stroke&&style.stroke!=="none"&&style.strokeOpacity!==0)for(const subpath of path.subPaths){
        const flat=SVGLoader.pointsToStroke(subpath.getPoints(16),style,8,.01);if(flat)flats.push(flat);
      }
      for(const flat of flats){
        if(!flat.attributes.position.count){flat.dispose();continue;}
        let geometry;
        try{geometry=solidDecoration(flat,placement.center,placement.depth);}finally{flat.dispose();}
        const face=new MeshStandardMaterial({map:texture,color:0xffffff,roughness:.5,alphaTest:.12});
        const raw=style.fill!=="none"?style.fill:style.stroke;
        const side=new MeshStandardMaterial({color:/^#[\da-f]{3,8}$/i.test(raw||"")?raw:body.colors.base,roughness:.52});
        const mesh=new Mesh(geometry,[face,side]);mesh.name=`${body.id}:decoration:${layer}`;group.add(mesh);
        objects.push(mesh);resources.push(geometry,face,side);
        if(objects.length>128)throw new Error("Decoration object budget exceeded");
      }
    }
    return Object.assign(cleanup,{count:objects.length});
  } catch(error){cleanup();throw error;}
}
