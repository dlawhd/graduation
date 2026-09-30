export const CREATION_PRESENTATION_MS = 5000;

/** 요청은 즉시 시작하고, 성공했을 때만 남은 연출 시간을 기다린다. 오류는 바로 사용자에게 전달한다. */
export async function presentCreation(create, { now = () => performance.now(), wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) } = {}) {
  const started = now();
  const result = await create();
  const remaining = CREATION_PRESENTATION_MS - (now() - started);
  if (remaining > 0) await wait(remaining);
  return result;
}
