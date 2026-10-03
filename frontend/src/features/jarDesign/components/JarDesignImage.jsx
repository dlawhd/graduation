import JarBodyArtwork from "./JarBodyArtwork";
import { getJarBody } from "../jarBodies.mjs";

/** 선택한 본체 안에 그림을 담고, 본체가 없는 이전 디자인은 원래 이미지 그대로 표시한다. */
export default function JarDesignImage({ bodyStyle, imageUrl, alt, className = "h-full w-full", imageRendering = "auto", imageStyle, onImageLoad, onImageError, showDefaultSlot = false }) {
  if (getJarBody(bodyStyle)) {
    return <JarBodyArtwork bodyStyle={bodyStyle} imageUrl={imageUrl} alt={alt} className={className}
      imageRendering={imageRendering} imageStyle={imageStyle} onImageLoad={onImageLoad}
      onImageError={onImageError} showDefaultSlot={showDefaultSlot} />;
  }
  return <img src={imageUrl} alt={alt} draggable={false} className={`${className} select-none object-contain`}
    style={{ ...imageStyle, imageRendering }} onLoad={onImageLoad} onError={onImageError} />;
}
