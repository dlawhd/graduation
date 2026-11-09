// 백엔드의 보호된 첨부 경로만 API 서버 주소로 바꾼다. S3·blob·기존 외부 주소는 그대로 유지한다.
export function resolvePrivateMedia(data, apiBase = "", origin = "http://localhost") {
  if (Array.isArray(data)) return data.map(value => resolvePrivateMedia(value, apiBase, origin));
  if (!data || typeof data !== "object") return data;
  return Object.fromEntries(Object.entries(data).map(([key, value]) => {
    if (["url", "thumbnailUrl", "publicUrl"].includes(key) && typeof value === "string"
        && /^\/api\/v1\/files\/(attachments|uploads)\/\d+\/content$/.test(value)) {
      return [key, new URL(`${String(apiBase || origin).replace(/\/+$/, "")}${value}`, origin).href];
    }
    return [key, resolvePrivateMedia(value, apiBase, origin)];
  }));
}

// 다른 사이트의 임의 이미지 실패 때문에 로그인 API를 호출하지 않는다.
export function isPrivateMediaSource(source, apiBase, origin) {
  if (typeof source !== "string") return false;
  try {
    const url = new URL(source, origin);
    const base = new URL(apiBase || origin, origin);
    return ["http:", "https:"].includes(url.protocol) && url.origin === base.origin
      && /\/api\/v1\/files\/(attachments|uploads)\/\d+\/content$/.test(url.pathname);
  } catch { return false; }
}

/** 여러 사진이 동시에 실패해도 세션 확인은 하나만 실행하고 실패 후 새 요청은 다시 허용한다. */
export function createMediaSessionCheck(check) {
  let pending = null;
  return () => {
    if (!pending) {
      const current = Promise.resolve().then(check);
      pending = current.finally(() => { pending = null; });
    }
    return pending;
  };
}
