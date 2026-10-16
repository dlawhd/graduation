import {ShapePath,ShapeGeometry,Float32BufferAttribute} from "three";
import {solidDecoration} from "./preparedBodyDecorations.mjs";
import {simplifyContour} from "./bodyContours.mjs";

export const IMAGE_ONLY_DEPTH=.24;
export const IMAGE_ONLY_PROFILE={photoSafe:true,renderOutline:[{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}]};

/** 서비스가 만든 자르기 마스크만 읽는다. 임의 CSS/SVG는 원본을 보존한 2D로 복구한다. */
export function imageOnlyMask(style) {
  if(!style||!Object.values(style).some(v=>v!=null&&v!==""))return [];
  const allowed=["maskImage","WebkitMaskImage","maskSize","WebkitMaskSize","maskRepeat","WebkitMaskRepeat"];
  if(Object.keys(style).some(key=>!allowed.includes(key)))throw new Error("Unsupported image style");
  const match=/^url\("data:image\/svg\+xml,([^"\s]+)"\)$/.exec(style.maskImage||style.WebkitMaskImage||"");
  if(!match||match[1].length>200000)throw new Error("Unsupported image mask");
  const svg=decodeURIComponent(match[1]);
  const polygons=[...svg.matchAll(/<polygon points="([\d., ]+)" fill="white"\/>/g)];
  if(!polygons.length||polygons.length>30)throw new Error("Invalid image mask");
  return polygons.map(([,coordinates])=>{
    const points=coordinates.trim().split(/\s+/).map(pair=>pair.split(",").map(Number));
    if(points.length<3||points.length>240||points.some(p=>p.length!==2||p.some(n=>!Number.isFinite(n)||n<0||n>1000)))throw new Error("Invalid mask points");
    return points.map(([x,y])=>({x:x/1000,y:y/1000}));
  });
}

/** 2D의 object-contain 배치와 투명도/외곽 자르기를 같은 480px 좌표에 그린다. */
export function drawImageOnlyPhoto(context,image,style,pixelated=false) {
  const regions=imageOnlyMask(style),size=480;
  context.clearRect(0,0,size,size);context.save();
  try {
    if(regions.length){
      context.beginPath();
      for(const region of regions){
        // SVG의 여러 polygon처럼 합집합으로 자른다. 반대 방향으로 그린 영역끼리 겹쳐도 구멍이 생기지 않는다.
        const area=region.reduce((sum,p,i)=>{const q=region[(i+1)%region.length];return sum+p.x*q.y-q.x*p.y;},0);
        const points=area<0?[...region].reverse():region;
        context.moveTo(points[0].x*size,points[0].y*size);for(const p of points.slice(1))context.lineTo(p.x*size,p.y*size);context.closePath();
      }
      context.clip();
    }
    const scale=Math.min(size/image.naturalWidth,size/image.naturalHeight),width=image.naturalWidth*scale,height=image.naturalHeight*scale;
    context.imageSmoothingEnabled=!pixelated;
    context.drawImage(image,(size-width)/2,(size-height)/2,width,height);
  } finally {context.restore();}
}

/** 이미지 단독은 128px, 직접 그린 테두리는 원본 480px에서 경계만 추출한다. 획의 폭과 빈 구멍을 보존한다. */
export function imageOnlyGeometry({width,height,data},{fullResolution=false}={}) {
  const maxSize=fullResolution?480:128;
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>maxSize||height>maxSize||data?.length!==width*height*4)throw new Error("Invalid image pixels");
  const edges=new Map(),stride=width+1;let red=0,green=0,blue=0,count=0;
  const filled=(x,y)=>x>=0&&y>=0&&x<width&&y<height&&data[(y*width+x)*4+3]>=24;
  const edge=(x,y,nx,ny)=>{
    const key=y*stride+x,targets=edges.get(key)||[];targets.push(ny*stride+nx);edges.set(key,targets);
  };
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const i=(y*width+x)*4;if(data[i+3]<24)continue;
    if(!filled(x,y-1))edge(x,y,x+1,y);
    if(!filled(x+1,y))edge(x+1,y,x+1,y+1);
    if(!filled(x,y+1))edge(x+1,y+1,x,y+1);
    if(!filled(x-1,y))edge(x,y+1,x,y);
    red+=data[i];green+=data[i+1];blue+=data[i+2];count++;
  }
  if(!count)throw new Error("Empty image silhouette");
  const shapePath=new ShapePath();let totalPoints=0,loops=0,perimeter=0;
  const point=key=>({x:key%stride,y:Math.floor(key/stride)});
  while(edges.size){
    const start=edges.keys().next().value,path=[];let at=start,previous=null;
    do {
      const p=point(at),targets=edges.get(at);if(!targets?.length)throw new Error("Open image contour");
      path.push(p);
      // 꼭짓점만 닿는 픽셀은 별도 경계로 따라가 서로 떨어진 획을 억지로 연결하지 않는다.
      const rank=key=>{if(!previous)return 0;const q=point(key),dx=p.x-previous.x,dy=p.y-previous.y,cross=dx*(q.y-p.y)-dy*(q.x-p.x);return cross>0?0:cross===0?1:2;};
      targets.sort((a,b)=>rank(a)-rank(b));const next=targets.shift();if(!targets.length)edges.delete(at);
      previous=p;at=next;
    }while(at!==start);
    const reduced=simplifyContour(path,fullResolution ? .5 : 1),contour=reduced.length>=3?reduced:path;
    if(fullResolution)for(let i=0;i<contour.length;i++){
      const a=contour[i],b=contour[(i+1)%contour.length];perimeter+=Math.hypot(b.x-a.x,b.y-a.y);
    }
    totalPoints+=contour.length;if(totalPoints>8192||++loops>2048)throw new Error("Image contour budget exceeded");
    shapePath.moveTo(contour[0].x/width*480,contour[0].y/height*480);
    for(const p of contour.slice(1))shapePath.lineTo(p.x/width*480,p.y/height*480);
    shapePath.currentPath.closePath();
  }
  const flat=new ShapeGeometry(shapePath.toShapes());
  try {
    // 좁은 띠의 넓이/양쪽 둘레로 실제 평균 획 폭을 구한다. 슬라이더 값만 바꾸거나 저장 계약을 추가하지 않는다.
    const strokeWidth=fullResolution?2*count/Math.max(perimeter,1):null;
    const depth=fullResolution?Math.max(.028,Math.min(.5,.02+strokeWidth/120)):IMAGE_ONLY_DEPTH;
    const geometry=solidDecoration(flat,0,depth);
    // 사진 면과 옆벽의 법선을 분리해 윤곽의 작은 굴곡이 사진 전체에 얼룩처럼 비치지 않게 한다.
    const positions=Array.from(geometry.attributes.position.array),uv=Array.from(geometry.attributes.uv.array),indices=Array.from(geometry.index.array),wallVertices=new Map();
    for(let i=geometry.groups[1].start;i<indices.length;i++){
      const original=indices[i];
      if(!wallVertices.has(original)){
        wallVertices.set(original,positions.length/3);
        positions.push(...geometry.attributes.position.array.slice(original*3,original*3+3));
        uv.push(...geometry.attributes.uv.array.slice(original*2,original*2+2));
      }
      indices[i]=wallVertices.get(original);
    }
    geometry.setAttribute("position",new Float32BufferAttribute(positions,3));
    geometry.setAttribute("uv",new Float32BufferAttribute(uv,2));geometry.setIndex(indices);
    // 옆벽 정점을 추가했으므로 이전 크기의 법선 버퍼를 재사용하지 않는다.
    geometry.deleteAttribute("normal");
    geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();
    if(fullResolution){
      // 1px 계단의 좌표/굵기는 고정하고 옆벽의 조명 법선만 주변과 섞어 가로 줄무늬를 줄인다.
      // 안쪽/바깥쪽 벽은 서로 반대 방향이므로 같은 평균에 넣지 않는다.
      const normal=geometry.attributes.normal,before=normal.array.slice(),position=geometry.attributes.position,cell=2/240,buckets=new Map();
      for(const index of wallVertices.values()){
        const key=`${Math.floor(position.getX(index)/cell)},${Math.floor(position.getY(index)/cell)}`;
        if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(index);
      }
      for(const index of wallVertices.values()){
        const x=position.getX(index),y=position.getY(index),bx=Math.floor(x/cell),by=Math.floor(y/cell),offset=index*3;
        let nx=0,ny=0,nz=0;
        for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)for(const neighbor of buckets.get(`${bx+dx},${by+dy}`)||[]){
          const n=neighbor*3,dot=before[offset]*before[n]+before[offset+1]*before[n+1]+before[offset+2]*before[n+2];
          if(dot>.1&&Math.hypot(position.getX(neighbor)-x,position.getY(neighbor)-y)<=cell){nx+=before[n];ny+=before[n+1];nz+=before[n+2];}
        }
        const length=Math.hypot(nx,ny,nz);if(length>1e-8)normal.setXYZ(index,nx/length,ny/length,nz/length);
      }
    }
    geometry.userData.sideColor=[red/count/255,green/count/255,blue/count/255];
    geometry.userData.photoHeight=()=>depth/2;
    geometry.userData.strokeWidth=strokeWidth;geometry.userData.extrusionDepth=depth;
    return geometry;
  } finally {flat.dispose();}
}
