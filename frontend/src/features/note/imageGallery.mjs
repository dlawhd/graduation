/** 확대창은 원본 주소가 있는 사진만 사용한다. 영상·미지원 첨부는 기존 슬라이드에서 확인한다. */
export function getNoteImages(attachments) {
  return Array.isArray(attachments) ? attachments.filter(item => typeof item?.contentType === "string" && item.contentType.startsWith("image/") && typeof item.url === "string" && item.url.trim()) : [];
}

/** 빠른 연속 입력도 첫 사진과 마지막 사진을 넘어가지 않게 한다. */
export function nextImageIndex(index, delta, total) {
  if (index === null || !Number.isInteger(index) || total < 1) return null;
  return Math.max(0, Math.min(total - 1, index + delta));
}
