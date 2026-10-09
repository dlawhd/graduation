import { useMemo } from "react";
import { customJarBody, customContainWindow } from "../customJarBody.mjs";
import { photoFrameStyle, coverPhotoFrame } from "../photoFraming.mjs";
import JarSlotOverlay from "./JarSlotOverlay";

/** 직접 만든 외곽선 안에 사진을 표시한다. 장식 없는 틀이며 모든 화면에서 같은 좌표를 사용한다. */
export default function CustomJarBodyArtwork({ customBody, imageUrl, photoFrame, className="h-full w-full", alt="내가 만든 저금통", imageRendering, imageStyle, onImageLoad, onImageError, showDefaultSlot, outlineOnly = false }) {
  const body=useMemo(()=>customJarBody(customBody),[customBody]);
  const whole=photoFrame?.fit === "CONTAIN";
  const fitted=useMemo(()=>body && whole ? customContainWindow(body,photoFrame) : null,[body,whole,photoFrame]);
  if (!body) return null;
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
  return <div role="img" aria-label={alt} data-jar-body="CUSTOM" className={`relative isolate aspect-square ${className}`}>
    <svg viewBox="0 0 480 480" aria-hidden="true" className="absolute inset-0 h-full w-full"><path d={body.path} fill="#334b3c" opacity=".08" transform="translate(0 5)"/><path d={body.path} fill={customBody.color} stroke="#5d7367" strokeWidth="2" strokeLinejoin="round"/></svg>
    <div className="absolute overflow-hidden bg-white" style={{left:`${w.x/4.8}%`,top:`${w.y/4.8}%`,width:`${w.width/4.8}%`,height:`${w.height/4.8}%`,clipPath:clip}}>
      <div className="absolute" style={{left:`${(photoWindow.x-w.x)/w.width*100}%`,top:`${(photoWindow.y-w.y)/w.height*100}%`,width:`${photoWindow.width/w.width*100}%`,height:`${photoWindow.height/w.height*100}%`}}>
        {imageUrl && <img src={imageUrl} alt="" draggable={false} style={{...photoFrameStyle(photoFrame || coverPhotoFrame(w),photoWindow),...imageStyle,imageRendering}} onLoad={onImageLoad} onError={onImageError}/>}
      </div>
    </div>
    {showDefaultSlot && <JarSlotOverlay slot={body.slot}/>}
  </div>;
}
