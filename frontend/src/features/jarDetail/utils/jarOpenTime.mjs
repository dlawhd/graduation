// 서버가 날짜를 해석하는 기준과 맞춰 오픈 시간 입력은 항상 한국 시간으로 처리한다.
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const LOCAL_MINUTE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const LOCAL_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/;

function formatKstMinute(timestamp) {
  if (!Number.isFinite(timestamp)) return "";
  return new Date(timestamp + KST_OFFSET_MS).toISOString().slice(0, 16);
}

/** 시간대가 있는 서버 응답도 한국 시간 입력칸에 맞춰 표시한다. */
export function formatJarOpenTime(value) {
  if (!value) return "";
  return formatKstMinute(Date.parse(LOCAL_DATE_TIME.test(value) ? `${value}+09:00` : value));
}

/** 현재 한국 시간보다 뒤의 유효한 날짜인지 확인한다. */
export function isFutureJarOpenTime(value, now = Date.now()) {
  if (!LOCAL_MINUTE.test(value)) return false;
  const timestamp = Date.parse(`${value}+09:00`);
  return timestamp > now && formatKstMinute(timestamp) === value;
}

/** 한국 시간으로 같은 시각을 유지한 채 지정한 일수만큼 뒤의 입력값을 만든다. */
export function jarOpenTimeAfterDays(days, now = Date.now()) {
  return formatKstMinute(now + days * DAY_MS);
}
