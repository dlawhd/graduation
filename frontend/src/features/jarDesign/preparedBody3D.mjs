import {photoFrameStyle} from "./photoFraming.mjs";
import {SELECTABLE_JAR_BODIES} from "./jarBodies.mjs";
import {canExtrudeHollowBody} from "./body3DGeometry.mjs";

/** 현재 선택 가능한 모든 본체를 지원한다. 저장된 본체 ID/사진 좌표는 변경하지 않는다. */
export const PREPARED_3D_IDS = Object.freeze(SELECTABLE_JAR_BODIES.map(body=>body.id));
export const supportsPrepared3D = id => PREPARED_3D_IDS.includes(id);

/** 기존 사진 창의 둥근 사각형을 3D에서도 같은 경계로 사용한다. */
export function preparedPhotoContour({ x, y, width, height, radius }) {
  const r = Math.min(radius, width / 2, height / 2), result = [];
  for (const [cx, cy, start] of [[x+width-r,y+r,-90],[x+width-r,y+height-r,0],
    [x+r,y+height-r,90],[x+r,y+r,180]]) {
    for (let step=0;step<=8;step++) {
      const angle=(start+step*90/8)*Math.PI/180;
      result.push({x:(cx+r*Math.cos(angle))/480,y:(cy+r*Math.sin(angle))/480});
    }
  }
  return result;
}

/** SVG의 실제 곡선을 균등 샘플링한다. 브라우저에서만 호출하며 API 저장값으로 보내지 않는다. */
export function preparedBodyOutline(body, path) {
  if (!supportsPrepared3D(body.id)) throw new Error("Unsupported prepared body");
  path.setAttribute("d", body.path);
  const length=path.getTotalLength();
  return {color:body.colors.base, points:Array.from({length:96},(_,i)=>{
    const p=path.getPointAtLength(length*i/96);
    return {x:p.x/480,y:p.y/480};
  }), photoContours:[preparedPhotoContour(body.window)]};
}

/** 검증된 카탈로그 도면은 사용자 그림판의 5% 여백 제한으로 자르지 않는다(예: 고래 꼬리).
 * 실제 사진 창이 외곽 안에 들어가는지는 기존 기하 검사로 다시 확인한다. */
export function preparedBodyProfile(value, body) {
  const photoContours=value.photoContours.map(contour=>contour.map(p=>({x:p.x*480,y:p.y*480})));
  const profile={window:body.window,renderOutline:value.points,photoContours,photoOutline:photoContours[0],
    photoMode:"CONTOURS",photoScale:1,naturalPhoto:true,customBody:value};
  return {...profile,photoSafe:canExtrudeHollowBody(profile)};
}

/** 준비된 SVG의 사진 배치 공식을 그대로 쓴다. CUSTOM의 자연 창 보정은 적용하지 않는다. */
export function preparedPhotoLayout(window, frame, image) {
  const style=photoFrameStyle(frame,window),w=window;
  if(style) return {x:w.x+parseFloat(style.left)*w.width/100,y:w.y+parseFloat(style.top)*w.height/100,
    width:parseFloat(style.width)*w.width/100,height:parseFloat(style.height)*w.height/100};
  const size=Math.min(w.width,w.height),ratio=image.naturalWidth/image.naturalHeight;
  const width=Math.min(size,size*ratio),height=Math.min(size,size/ratio);
  return {x:w.x+(w.width-width)/2,y:w.y+(w.height-height)/2,width,height};
}
