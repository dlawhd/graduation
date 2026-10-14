import { paintedBodyOutline } from "../../src/features/jarDesign/bodyPainting.mjs";
import {insetBodyContours} from "../../src/features/jarDesign/bodyContours.mjs";
import {drawShape} from "../../src/features/jarDesign/drawingTools.mjs";

/** 브라우저에서만 호출한다. 실제 그림판과 같은 PNG/외곽선/내부 경계를 만드는 다색 회귀 fixture다. */
export function multicolorBodyFixture(character=false) {
  const canvas=document.createElement("canvas");canvas.width=canvas.height=480;
  const ctx=canvas.getContext("2d"),points=DEEP_BODY_FIXTURE.points;
  const colors=["#ef4444","#fb7185","#f97316","#fbbf24","#a3e635","#14b8a6","#38bdf8","#8b5cf6"];
  ctx.lineWidth=24;ctx.lineCap="round";ctx.lineJoin="round";
  if(character) colors.forEach((color,i)=>{ctx.save();ctx.beginPath();ctx.rect(i*60,0,60,480);ctx.clip();ctx.strokeStyle=color;
    drawShape(ctx,"characterCat",{x:80,y:60},{x:400,y:420},false);ctx.restore();});
  else points.forEach((p,i)=>{const next=points[(i+1)%points.length];ctx.strokeStyle=colors[i%colors.length];
    ctx.beginPath();ctx.moveTo(p.x*480,p.y*480);ctx.lineTo(next.x*480,next.y*480);ctx.stroke();});
  const pixels=ctx.getImageData(0,0,480,480),result=paintedBodyOutline(pixels,"#8b5cf6",{encloseInterior:true});
  if(result.error)throw new Error(result.error);
  const photoContours=insetBodyContours(result.value.points,pixels.data);
  if(!photoContours.length)throw new Error("사진 경계 계산 실패");
  return {...result.value,photoContours,artworkUrl:canvas.toDataURL("image/png")};
}

/** 운영 요청 없이 좁은 연결부/팔다리/깊은 굴곡의 3D 회귀를 확인하는 합성 틀이다. 사용자 사진은 포함하지 않는다. */
export const DEEP_BODY_FIXTURE={color:"#3b82f6",points:[{x:.1,y:.1},{x:.9,y:.1},{x:.9,y:.9},{x:.65,y:.9},
  {x:.65,y:.3},{x:.35,y:.3},{x:.35,y:.9},{x:.1,y:.9}]};

/** 아래 끝이 뾰족해도 사진을 건드리지 않고 수평 바닥을 만들 수 있는지 확인한다. */
export const POINTED_BODY_FIXTURE={color:"#a7d9c5",points:[{x:.2,y:.12},{x:.8,y:.12},{x:.9,y:.65},
  {x:.68,y:.82},{x:.5,y:.95},{x:.32,y:.82},{x:.1,y:.65}]};

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
