/** 같은 URL을 다시 받아도 재시도 횟수까지 포함해 별개의 이미지 로드로 구분한다. */
export function createPreviewImageKey(selectionKey, imageUrl, attempt = 0) {
  return `${selectionKey}:${imageUrl}:${attempt}`;
}

/**
 * Effect로 상태를 초기화하지 않고 현재 이미지 Key와 실제 load/error 결과를 비교한다.
 * 이 방식은 캐시 이미지의 onLoad 뒤에 Effect가 loading을 덮어쓰는 경쟁을 막는다.
 */
export function resolvePreviewImageState({
  isCustom,
  imageUrl,
  imageKey,
  loadedImageKey,
  failedImageKey,
}) {
  if (!isCustom) return "ready";
  if (!imageUrl) return "missing";
  if (failedImageKey === imageKey) return "failed";
  if (loadedImageKey === imageKey) return "ready";
  return "loading";
}
