import { Mesh, MeshStandardMaterial, SphereGeometry, Shape, ExtrudeGeometry, Vector3,
  Raycaster, CatmullRomCurve3, TubeGeometry } from "three";

/** 앞면에는 원래 얼굴을, 뒷면과 옆면에는 본체 색을 사용해 뒤에도 얼굴이 생기는 것을 막는다. */
export function preparedMaterialGroups(geometry) {
  const indices=geometry.index.array, positions=geometry.attributes.position;
  const buckets=[[],[],[]];
  for(const group of geometry.groups) for(let i=group.start;i<group.start+group.count;i+=3) {
    const triangle=[indices[i],indices[i+1],indices[i+2]];
    const front=triangle.every(v=>positions.getZ(v)>0);
    const material=group.materialIndex===1?1:front?0:2;
    buckets[material].push(...triangle);
  }
  geometry.setIndex(buckets.flat());geometry.clearGroups();
  let start=0;
  buckets.forEach((bucket,index)=>{geometry.addGroup(start,bucket.length,index);start+=bucket.length;});
}

/** 코/리본은 작은 입체 부품으로 더하고 귀/발의 외곽은 원본 몸통을 따른다. GPU 자원은 함께 해제한다. */
export function addPreparedBodyRelief(group, bodyMesh, body, texture) {
  const resources=[], objects=[], ray=new Raycaster();
  bodyMesh.updateMatrixWorld(true);
  const depth=(x,y)=>{
    ray.set(new Vector3((x-240)/240,(240-y)/240,3),new Vector3(0,0,-1));
    return ray.intersectObject(bodyMesh,false)[0]?.point.z || .15;
  };
  const add=(geometry,color,map=null)=>{
    const material=new MeshStandardMaterial({color,roughness:.43,metalness:0,map});
    const mesh=new Mesh(geometry,material);group.add(mesh);
    resources.push(geometry,material);objects.push(mesh);return mesh;
  };
  // 같은 480px 좌표로 UV를 투영해 코 위의 콧구멍과 리본 무늬가 어긋나지 않게 한다.
  const mapped=(geometry)=>{
    const p=geometry.attributes.position,uv=geometry.attributes.uv;
    for(let i=0;i<p.count;i++) uv.setXY(i,(p.getX(i)+1)/2,(p.getY(i)+1)/2);
    return geometry;
  };
  const bump=(x,y,rx,ry,rz)=>{
    const geometry=new SphereGeometry(1,28,16);
    geometry.scale(rx/240,ry/240,rz/240);
    geometry.translate((x-240)/240,(240-y)/240,depth(x,y)-rz/480);
    return add(mapped(geometry),0xffffff,texture);
  };
  const badge=(points,thickness)=>{
    const shape=new Shape();
    points.forEach(([x,y],i)=>i?shape.lineTo((x-240)/240,(240-y)/240):shape.moveTo((x-240)/240,(240-y)/240));shape.closePath();
    const x=points.reduce((n,p)=>n+p[0],0)/points.length,y=points.reduce((n,p)=>n+p[1],0)/points.length;
    const geometry=new ExtrudeGeometry(shape,{depth:thickness/240,steps:1,bevelEnabled:true,bevelSize:1/240,bevelThickness:1/240,bevelSegments:3});
    geometry.translate(0,0,depth(x,y)-.01);
    add(mapped(geometry),0xffffff,texture);
  };
  if(body.id==="PIG") {
    bump(240,213,28,19,14);
    badge([[204,98],[199,64],[219,77],[240,50],[261,77],[281,64],[276,98]],5);
  } else if(body.id==="CAT") {
    bump(240,216,9,6,5);
  } else if(body.id==="RABBIT") {
    bump(240,242,7,5,4);
    badge([[327,173],[302,148],[294,157],[295,170],[311,183],[289,182],[281,192],[286,204],[313,193],[315,194],[319,212],[341,217],[319,185]],7);
    bump(317,181,8,8,7);
  }
  // 몸통 밖 장식도 평면 텍스처로 떠 있지 않게 실제 꼬리로 연결한다.
  if(body.id==="RABBIT") {
    const tail=add(new SphereGeometry(1,24,16),body.colors.base);
    tail.scale.set(22/240,22/240,20/240);tail.position.set(128/240,-123/240,-.025);
  } else if(body.id==="PIG" || body.id==="CAT") {
    const pixels=body.id==="PIG"?[[388,282],[424,286],[437,269],[421,257],[408,264],[420,275]]:
      [[361,375],[407,381],[433,356],[419,325],[400,290],[411,268]];
    const curve=new CatmullRomCurve3(pixels.map(([x,y])=>new Vector3((x-240)/240,(240-y)/240,-.025)));
    add(new TubeGeometry(curve,48,(body.id==="PIG"?4:9)/240,8,false),body.colors.base);
  }
  return ()=>{objects.forEach(object=>group.remove(object));resources.forEach(resource=>resource.dispose());};
}
