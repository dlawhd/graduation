/** 서버 초안에 딸린 입력 중 아직 제출하지 않은 이름·날짜와 확정 단계를 계정별로 보관한다. */
export function designResumeKey(userId, draftId, part) {
  return /^[1-9]\d*$/.test(String(userId)) && /^[1-9]\d*$/.test(String(draftId))
    ? `memoryjar:design-resume:v1:${userId}:${draftId}:${part}` : null;
}
export function readDesignResume(userId, draftId, part) {
  try {
    const key = designResumeKey(userId, draftId, part);
    return key ? JSON.parse(localStorage.getItem(key) || "null") : null;
  } catch { return null; }
}
export function writeDesignResume(userId, draftId, part, value) {
  const key = designResumeKey(userId, draftId, part);
  if (!key) return;
  if (value == null) localStorage.removeItem(key);
  else localStorage.setItem(key, JSON.stringify(value));
}
