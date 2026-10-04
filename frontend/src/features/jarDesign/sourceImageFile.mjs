/** 모바일 사진 선택기의 MIME 누락을 보완한다. 최종 디코딩·심사는 서버 검증을 그대로 사용한다. */
export const SOURCE_IMAGE_ACCEPT = "image/*,.jpg,.jpeg,.png,.webp";
export const MAX_SOURCE_IMAGE_BYTES = 10 * 1024 * 1024;

export async function prepareSourceImage(file) {
  if (!file?.size) throw new Error("내용이 없는 파일이에요. 다른 사진을 선택해 주세요.");
  if (file.size > MAX_SOURCE_IMAGE_BYTES) throw new Error("원본 이미지는 10MB를 초과할 수 없어요.");
  // 파일명이나 MIME만으로 통과시키지 않는다. 전체 파일을 복사하지 않고 작은 헤더만 읽는다.
  let bytes;
  try { bytes = new Uint8Array(await file.slice(0, 32).arrayBuffer()); }
  catch { throw new Error("사진 파일을 읽지 못했어요. 기기에 다운로드한 사진을 다시 선택해 주세요."); }
  const ascii = (from, to) => String.fromCharCode(...bytes.slice(from, to));
  let type;
  if ([137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v)) type="image/png";
  else if (bytes[0]===255 && bytes[1]===216 && bytes[2]===255) type="image/jpeg";
  else if (ascii(0,4)==="RIFF" && ascii(8,12)==="WEBP") type="image/webp";
  if (!type) {
    if ((ascii(4,8)==="ftyp" && /heic|heix|hevc|hevx|mif1|msf1|avif|avis/.test(ascii(8,32))) || /\.(heic|heif|avif)$/i.test(file.name || ""))
      throw new Error("HEIC·HEIF·AVIF 사진은 아직 지원하지 않아요. JPEG 또는 PNG로 변환한 사진을 선택해 주세요.");
    throw new Error("PNG, JPEG, WebP 이미지 파일만 선택할 수 있어요.");
  }
  // bytes는 그대로 보존하고 누락/부정확한 multipart Content-Type만 보정한다.
  return file.type === type ? file : new File([file], file.name || "photo", { type, lastModified: file.lastModified });
}
