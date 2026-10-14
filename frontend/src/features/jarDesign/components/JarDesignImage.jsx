import JarBodyArtwork from "./JarBodyArtwork";
import { getJarBody } from "../jarBodies.mjs";
import CustomJarBodyArtwork from "./CustomJarBodyArtwork";
import CustomJarBodyViewer from "./CustomJarBodyViewer";
import JarSlotOverlay from "./JarSlotOverlay";
import { customJarBody } from "../customJarBody.mjs";
import PreparedJarBodyViewer from "./PreparedJarBodyViewer";
import { supportsPrepared3D } from "../preparedBody3D.mjs";

/** 선택한 본체 안에 그림을 담고, 본체가 없는 이전 디자인은 원래 이미지 그대로 표시한다. */
export default function JarDesignImage({ bodyStyle, customBody, imageUrl, photoFrame, alt, className = "h-full w-full", imageRendering = "auto", imageStyle, onImageLoad, onImageError, showDefaultSlot = false, allow3D = false, slot = null, frontViewRequest = 0, viewDisabled = false, viewerStageStyle, viewControlsTarget = null, imageTextureUrl, bodyArtworkTextureUrl }) {
  if (bodyStyle === "CUSTOM" && allow3D) {
    const savedSlot=slot || (showDefaultSlot ? customJarBody(customBody)?.slot : null);
    return <CustomJarBodyViewer {...{customBody,imageUrl,photoFrame,imageStyle,imageRendering,className,frontViewRequest,imageTextureUrl,bodyArtworkTextureUrl}} slot={savedSlot} disabled={viewDisabled}>
      <CustomJarBodyArtwork {...{customBody,imageUrl,photoFrame,alt,imageRendering,imageStyle,onImageLoad,onImageError}}/>
      {savedSlot && <JarSlotOverlay slot={savedSlot}/>}
    </CustomJarBodyViewer>;
  }
  if (bodyStyle === "CUSTOM" || getJarBody(bodyStyle)) {
    // 선택 전에는 입구를 만들지 않는다. 저장된 입구가 전달되면 기본 위치 대신 실제 좌표로 표시한다.
    const artworkProps={customBody,bodyStyle,imageUrl,photoFrame,alt,className:slot ? "h-full w-full" : className,imageRendering,imageStyle,onImageLoad,onImageError,showDefaultSlot:!slot && showDefaultSlot};
    const artwork=bodyStyle === "CUSTOM" ? <CustomJarBodyArtwork {...artworkProps}/> : <JarBodyArtwork {...artworkProps}/>;
    const result=slot ? <div className={`relative ${className}`}>{artwork}<JarSlotOverlay slot={slot}/></div> : artwork;
    if(allow3D && supportsPrepared3D(bodyStyle)) {
      const body=getJarBody(bodyStyle);
      return <PreparedJarBodyViewer {...{body,imageUrl,photoFrame,imageStyle,imageRendering,className,frontViewRequest,viewerStageStyle,viewControlsTarget,imageTextureUrl}} disabled={viewDisabled} slot={slot || (showDefaultSlot ? body.slot : null)}>{result}</PreparedJarBodyViewer>;
    }
    return result;
  }
  const image=<img src={imageUrl} alt={alt} draggable={false} className={`${slot?"h-full w-full":className} select-none object-contain`}
    style={{ ...imageStyle, imageRendering }} onLoad={onImageLoad} onError={onImageError} />;
  // 이미지 단독/이전 디자인도 이 컴포넌트가 입구를 한 번만 그린다. 부모는 중복 오버레이를 붙이지 않는다.
  return slot ? <div className={`relative ${className}`}>{image}<JarSlotOverlay slot={slot}/></div> : image;
}
