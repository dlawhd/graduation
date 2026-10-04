/** 모바일 사진의 큰 용량·클라우드 파일 핸들을 작은 메모리 파일로 바꾼다. 서버의 형식/콘텐츠 검사는 그대로 유지한다. */
export const MAX_UPLOAD_BYTES = 850 * 1024;
export const MAX_UPLOAD_EDGE = 1280;

/** 전송 전에 파일 바이트를 확보한다. 파일 선택기 핸들이 사라져도 업로드가 이어지며 자동 재전송은 하지 않는다. */
export async function prepareSourceUpload(file) {
  const name = file.name || "jar-design-original.png";
  let snapshot;
  try { snapshot = new File([await file.arrayBuffer()], name, { type: file.type, lastModified: file.lastModified }); }
  catch { throw new Error("사진 원본을 읽지 못했어요. 기기에 다운로드한 사진을 다시 선택해 주세요."); }
  if (snapshot.size <= MAX_UPLOAD_BYTES) return snapshot;
  const url = URL.createObjectURL(snapshot);
  try {
    const image = new Image();
    await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = () => reject(new Error("사진을 처리하지 못했어요. JPEG 또는 PNG로 다시 저장해 주세요.")); image.src = url; });
    // 서버도 480px로 정규화한다. 비율/투명도를 지키고 먼저 큰 해상도부터 시도하여 불필요한 손실을 줄인다.
    const type = file.type === "image/jpeg" ? "image/jpeg" : "image/png";
    let edge = Math.min(MAX_UPLOAD_EDGE, Math.max(image.naturalWidth, image.naturalHeight));
    while (true) {
      const scale = edge / Math.max(image.naturalWidth, image.naturalHeight);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, type, .9));
      canvas.width = 1; canvas.height = 1;
      if (!blob) throw new Error("사진 파일을 준비하지 못했어요. 다른 사진으로 다시 시도해 주세요.");
      if (blob.size <= MAX_UPLOAD_BYTES) return new File([blob], name.replace(/\.[^.]+$/, "") + (type === "image/png" ? ".png" : ".jpg"), { type, lastModified: file.lastModified });
      if (edge <= 480) break;
      edge = Math.max(480, Math.floor(edge * .75));
    }
    throw new Error("사진을 전송할 크기로 줄이지 못했어요. 사진을 조금 작게 저장한 뒤 다시 선택해 주세요.");
  } finally { URL.revokeObjectURL(url); }
}
