import { openTextureSource } from "../../jarDesign/textureSource.mjs";

/** 바깥과 연결된 거의 흰 배경만 찾는다. 눈·사진 내부의 흰 부분은 지우지 않으며 원본 파일도 변경하지 않는다. */
export function foregroundAlpha(rgba, width, height) {
  if (!(rgba instanceof Uint8ClampedArray) || !Number.isInteger(width) || !Number.isInteger(height) || rgba.length !== width * height * 4 || width < 1 || height < 1 || width * height > 1024 * 1024) throw new Error("Invalid silhouette pixels");
  const count = width * height, background = new Uint8Array(count), queue = new Int32Array(count);
  const nearWhite = i => rgba[i * 4 + 3] < 20 || (Math.min(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]) >= 242
    && Math.max(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]) - Math.min(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]) <= 14);
  const border = [];
  for (let x = 0; x < width; x++) { border.push(x); if (height > 1) border.push((height - 1) * width + x); }
  for (let y = 1; y < height - 1; y++) { border.push(y * width); if (width > 1) border.push(y * width + width - 1); }
  const plainBorder = border.filter(nearWhite).length / border.length >= .94;
  let read = 0, write = 0;
  const add = index => {
    if (!background[index] && (rgba[index * 4 + 3] < 20 || plainBorder && nearWhite(index))) {
      background[index] = 1; queue[write++] = index;
    }
  };
  border.forEach(add);
  while (read < write) {
    const index = queue[read++], x = index % width, y = Math.floor(index / width);
    if (x) add(index - 1); if (x < width - 1) add(index + 1);
    if (y) add(index - width); if (y < height - 1) add(index + width);
  }
  const alpha = new Uint8Array(count);
  for (let i = 0; i < count; i++) alpha[i] = background[i] ? 0 : rgba[i * 4 + 3];
  return alpha;
}

/** 저장된 도면은 그대로 사용한다. 외부 SVG 문자열을 받지 않고 검증된 본체 경로만 마스크로 그린다. */
export function vectorOpeningSilhouette(path) {
  const canvas = document.createElement("canvas"), ctx = canvas.getContext("2d"), outline = new Path2D(path);
  return { url: "data:image/svg+xml," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="480" height="480"><path d="${path}" fill="white"/></svg>`),
    contains: (x, y) => ctx.isPointInPath(outline, x, y) };
}

/** 이미지 단독 디자인의 실제 윤곽을 읽는다. 인증은 서버가 발급한 텍스처 경로에만 보내고 외부 URL에는 보내지 않는다. */
export async function loadOpeningSilhouette(imageUrl, textureUrl, { signal, fetchBlob } = {}) {
  const source = await openTextureSource(imageUrl, textureUrl, { signal, fetchBlob });
  let image;
  try {
    image = await new Promise((resolve, reject) => {
      const node = new Image(); let settled = false;
      const finish = (error) => {
        if (settled) return; settled = true;
        clearTimeout(timer); signal?.removeEventListener("abort", abort);
        node.onload = null; node.onerror = null;
        if (error) { node.src = ""; reject(error); } else resolve(node);
      };
      const abort = () => finish(new DOMException("이미지 읽기를 취소했습니다.", "AbortError"));
      const timer = setTimeout(() => finish(new Error("Silhouette timeout")), 8000);
      if (signal?.aborted) { abort(); return; }
      signal?.addEventListener("abort", abort, { once: true });
      node.crossOrigin = "anonymous"; node.onload = () => finish(); node.onerror = () => finish(new Error("Silhouette unavailable"));
      node.src = source.url;
    });
    if (signal?.aborted) throw new DOMException("이미지 읽기를 취소했습니다.", "AbortError");
    const canvas = document.createElement("canvas"); canvas.width = 480; canvas.height = 480;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const scale = Math.min(480 / image.naturalWidth, 480 / image.naturalHeight);
    ctx.drawImage(image, (480 - image.naturalWidth * scale) / 2, (480 - image.naturalHeight * scale) / 2, image.naturalWidth * scale, image.naturalHeight * scale);
    const alpha = foregroundAlpha(ctx.getImageData(0, 0, 480, 480).data, 480, 480);
    if (alpha.reduce((sum, value) => sum + (value > 40 ? 1 : 0), 0) < 64) throw new Error("Empty silhouette");
    const pixels = ctx.createImageData(480, 480);
    for (let i = 0; i < alpha.length; i++) { pixels.data[i * 4] = 255; pixels.data[i * 4 + 1] = 255; pixels.data[i * 4 + 2] = 255; pixels.data[i * 4 + 3] = alpha[i]; }
    ctx.putImageData(pixels, 0, 0);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/png"));
    if (!blob || signal?.aborted) throw new DOMException("이미지 읽기를 취소했습니다.", "AbortError");
    const url = URL.createObjectURL(blob); let disposed = false;
    return { url, contains: (x, y) => alpha[Math.max(0, Math.min(479, Math.round(y))) * 480 + Math.max(0, Math.min(479, Math.round(x)))] > 40,
      dispose() { if (!disposed) { disposed = true; URL.revokeObjectURL(url); } } };
  } finally { source.dispose(); }
}
