import { useMemo } from "react";
import { customJarBody, customContainWindow } from "../customJarBody.mjs";
import { photoFrameStyle, coverPhotoFrame } from "../photoFraming.mjs";
import JarSlotOverlay from "./JarSlotOverlay";
import { BODY_3D_PHOTO_SCALE, body3DContainWindow } from "../body3DGeometry.mjs";

/** 직접 만든 외곽선 안에 사진을 표시한다. 장식 없는 틀이며 모든 화면에서 같은 좌표를 사용한다. */
export default function CustomJarBodyArtwork({ customBody, imageUrl, photoFrame, className="h-full w-full", alt="내가 만든 저금통", imageRendering, imageStyle, onImageLoad, onImageError, showDefaultSlot, outlineOnly = false, suppressShadow = false, photoOnly = false, renderProfile }) {
  const body=useMemo(()=>customJarBody(customBody),[customBody]);
  const whole=photoFrame?.fit === "CONTAIN";
  const fitted=useMemo(()=>body && whole
    ? (photoOnly && renderProfile?.photoSafe ? body3DContainWindow(renderProfile,photoFrame) : customContainWindow(body,photoFrame))
    : null,[body,whole,photoFrame,photoOnly,renderProfile]);
  if (!body) return null;
  // 3D의 몸통은 WebGL 곡면이 그린다. 평평한 SVG가 그 위를 덮지 않도록 사진 합성만 재사용한다.
  if (photoOnly && outlineOnly && !imageUrl) return null;
  // 틀을 만드는 동안에는 내부 채움/그림자를 생략한다. 사진이 들어오면 기존 사진 합성을 그대로 사용한다.
  if (outlineOnly && !imageUrl) return <div role="img" aria-label={alt} data-jar-body="CUSTOM" className={`relative isolate aspect-square ${className}`}>
    <svg viewBox="0 0 480 480" aria-hidden="true" className="absolute inset-0 h-full w-full">
      {/* 흰색이나 밝은 틀도 배경에서 구분되도록 색상 테두리 양쪽에 얇은 경계를 남긴다. */}
      <path d={body.path} fill="none" stroke="#5d7367" strokeWidth="10" strokeLinejoin="round"/>
      <path d={body.path} fill="none" stroke={customBody.color} strokeWidth="8" strokeLinejoin="round"/>
    </svg>
  </div>;
  const w=body.window;
  const clip="polygon("+body.photoOutline.map(p=>`${(p.x-w.x)/w.width*100}% ${(p.y-w.y)/w.height*100}%`).join(",")+")";
  const photoWindow=fitted || w;
  // 3D 사진 판과 같은 경계로 자른다. 깊은 굴곡에서도 흰 사진 창이 몸통 밖으로 튀어나오지 않는다.
  const photoClip=photoOnly && renderProfile?.photoSafe
    ? "polygon("+renderProfile.photoOutline.map(p=>`${p.x/4.8}% ${p.y/4.8}%`).join(",")+")" : undefined;
  return <div role="img" aria-label={alt} data-jar-body="CUSTOM" className={`relative isolate aspect-square ${className}`} style={{clipPath:photoClip}}>
    {!photoOnly && <svg viewBox="0 0 480 480" aria-hidden="true" className="absolute inset-0 h-full w-full">{!suppressShadow && <path d={body.path} fill="#334b3c" opacity=".08" transform="translate(0 5)"/>}<path d={body.path} fill={customBody.color} stroke="#5d7367" strokeWidth="2" strokeLinejoin="round"/></svg>}
    <div className="absolute overflow-hidden bg-white" style={{left:`${w.x/4.8}%`,top:`${w.y/4.8}%`,width:`${w.width/4.8}%`,height:`${w.height/4.8}%`,clipPath:photoOnly?undefined:clip,
      // 몸통 곡면에 맞춰 3D 사진 창만 같은 비율로 줄인다. 내부 사진의 위치/확대/전체 보기는 바꾸지 않는다.
      ...(photoOnly?{transform:`scale(${BODY_3D_PHOTO_SCALE})`,transformOrigin:"50% 50%"}:{})}}>
      <div className="absolute" style={{left:`${(photoWindow.x-w.x)/w.width*100}%`,top:`${(photoWindow.y-w.y)/w.height*100}%`,width:`${photoWindow.width/w.width*100}%`,height:`${photoWindow.height/w.height*100}%`}}>
        {imageUrl && <img src={imageUrl} alt="" draggable={false} style={{...photoFrameStyle(photoFrame || coverPhotoFrame(w),photoWindow),...imageStyle,imageRendering}} onLoad={onImageLoad} onError={onImageError}/>}
      </div>
    </div>
    {showDefaultSlot && <JarSlotOverlay slot={body.slot}/>}
  </div>;
}
