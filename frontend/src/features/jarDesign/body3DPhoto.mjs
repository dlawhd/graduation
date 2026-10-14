import {body3DContainWindow} from "./body3DGeometry.mjs";
import {coverPhotoFrame, photoFrameStyle} from "./photoFraming.mjs";

/** 기존 사진 배치 공식을 그대로 사용해 3D 곡면에 입힐 480px 텍스처의 이미지/클립 영역을 계산한다. */
export function body3DPhotoLayout(profile,frame) {
  const w=profile.window,scale=profile.photoScale||1,cx=w.x+w.width/2,cy=w.y+w.height/2;
  const unscaled={...w,x:cx-w.width/scale/2,y:cy-w.height/scale/2,width:w.width/scale,height:w.height/scale};
  const fitted=frame?.fit==="CONTAIN"?body3DContainWindow(profile,frame):unscaled;
  const clip={x:cx+(fitted.x-cx)*scale,y:cy+(fitted.y-cy)*scale,width:fitted.width*scale,height:fitted.height*scale};
  const style=photoFrameStyle(frame||coverPhotoFrame(unscaled),fitted);
  if(!style||![clip.x,clip.y,clip.width,clip.height].every(Number.isFinite)||clip.width<=0||clip.height<=0)
    throw new Error("Invalid photo placement");
  const image={x:clip.x+parseFloat(style.left)/100*clip.width,y:clip.y+parseFloat(style.top)/100*clip.height,
    width:parseFloat(style.width)/100*clip.width,height:parseFloat(style.height)/100*clip.height};
  return {clip,image};
}

/** 사진은 저장하지 않고 로컬 Canvas 텍스처만 만든다. 흰 여백/확대/전체 보기와 픽셀 스타일을 유지한다. */
export function drawBody3DPhoto(context,image,profile,frame,pixelated=false) {
  const layout=body3DPhotoLayout(profile,frame);
  context.clearRect(0,0,480,480);context.fillStyle="#ffffff";context.fillRect(0,0,480,480);
  context.save();context.imageSmoothingEnabled=!pixelated;
  const c=layout.clip,r=layout.image;
  context.beginPath();context.rect(c.x,c.y,c.width,c.height);context.clip();
  context.drawImage(image,r.x,r.y,r.width,r.height);context.restore();
}
