import { paintedBodyOutline } from "../../src/features/jarDesign/bodyPainting.mjs";

/** 운영 요청 없이 좁은 연결부/팔다리/깊은 굴곡의 3D 회귀를 확인하는 합성 틀이다. 사용자 사진은 포함하지 않는다. */
export const DEEP_BODY_FIXTURE={color:"#3b82f6",points:[{x:.1,y:.1},{x:.9,y:.1},{x:.9,y:.9},{x:.65,y:.9},
  {x:.65,y:.3},{x:.35,y:.3},{x:.35,y:.9},{x:.1,y:.9}]};

/** 실제 그림판처럼 픽셀 영역을 외곽선으로 읽어 두 개의 둥근 부분과 가는 팔다리를 만든다. */
export function narrowBodyFixture() {
  const data=new Uint8ClampedArray(480*480*4);
  const limb=(x,y,a,b,radius)=>{
    const dx=b[0]-a[0],dy=b[1]-a[1];
    const t=Math.max(0,Math.min(1,((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy)));
    return Math.hypot(x-a[0]-t*dx,y-a[1]-t*dy)<=radius;
  };
  for(let y=0;y<480;y++) for(let x=0;x<480;x++) {
    const inside=((x-155)/85)**2+((y-225)/130)**2<=1 || ((x-310)/85)**2+((y-140)/90)**2<=1
      || (x>=210&&x<=310&&y>=180&&y<=340) || (x>=300&&x<=400&&y>=240&&y<=252)
      || limb(x,y,[175,315],[127,410],12) || limb(x,y,[265,320],[327,405],10);
    if(inside) data.set([59,130,246,255],(y*480+x)*4);
  }
  const result=paintedBodyOutline({width:480,height:480,data},"#3b82f6");
  if(result.error) throw new Error(result.error);
  return result.value;
}
