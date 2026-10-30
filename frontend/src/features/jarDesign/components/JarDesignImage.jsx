import JarBodyArtwork from "./JarBodyArtwork";
import { getJarBody } from "../jarBodies.mjs";
import CustomJarBodyArtwork from "./CustomJarBodyArtwork";
import CustomJarBodyViewer from "./CustomJarBodyViewer";
import JarSlotOverlay from "./JarSlotOverlay";
import { customJarBody } from "../customJarBody.mjs";

/** 선택한 본체 안에 그림을 담고, 본체가 없는 이전 디자인은 원래 이미지 그대로 표시한다. */
export default function JarDesignImage({ bodyStyle, customBody, imageUrl, photoFrame, alt, className = "h-full w-full", imageRendering = "auto", imageStyle, onImageLoad, onImageError, showDefaultSlot = false, allow3D = false, slot = null, frontViewRequest = 0, viewDisabled = false, imageTextureUrl, bodyArtworkTextureUrl }) {
  if (bodyStyle === "CUSTOM" && allow3D) {
    const savedSlot=slot || (showDefaultSlot ? customJarBody(customBody)?.slot : null);
    return <CustomJarBodyViewer {...{customBody,imageUrl,photoFrame,imageStyle,imageRendering,className,frontViewRequest,imageTextureUrl,bodyArtworkTextureUrl}} slot={savedSlot} disabled={viewDisabled}>
      <CustomJarBodyArtwork {...{customBody,imageUrl,photoFrame,alt,imageRendering,imageStyle,onImageLoad,onImageError}}/>
      {savedSlot && <JarSlotOverlay slot={savedSlot}/>}
    </CustomJarBodyViewer>;
  }
  if (bodyStyle === "CUSTOM") return <CustomJarBodyArtwork {...{customBody,imageUrl,photoFrame,alt,className,imageRendering,imageStyle,onImageLoad,onImageError,showDefaultSlot}}/>;
  if (getJarBody(bodyStyle)) {
    return <JarBodyArtwork bodyStyle={bodyStyle} imageUrl={imageUrl} photoFrame={photoFrame} alt={alt} className={className}
      imageRendering={imageRendering} imageStyle={imageStyle} onImageLoad={onImageLoad}
      onImageError={onImageError} showDefaultSlot={showDefaultSlot} />;
  }
  return <img src={imageUrl} alt={alt} draggable={false} className={`${className} select-none object-contain`}
    style={{ ...imageStyle, imageRendering }} onLoad={onImageLoad} onError={onImageError} />;
}
