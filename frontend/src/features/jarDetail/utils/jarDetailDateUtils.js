/*
 * jarDetailDateUtils 역할
 *
 * 저금통 상세 화면에서 날짜와 시간을
 * 화면에 보기 좋은 문자열로 바꾸는 도구 모음이야.
 *
 * 쉽게 말하면:
 * 서버가 준 "2026-06-28T10:00:00" 같은 값을
 * "2026. 06. 28. 오전 10:00"처럼 사람이 읽기 좋게 바꿔줘.
 */

export function formatDate(dateTime) {
  if (!dateTime) return "-";

  const date = new Date(dateTime);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return date.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/*
 * input type="datetime-local"에 넣기 좋은 형태로 바꿔주는 함수야.
 *
 * 예:
 * 2026-06-28T10:30:00+09:00
 * → 2026-06-28T10:30
 */
export function formatDateTimeLocalValue(dateTime) {
  if (!dateTime) return "";

  const date = new Date(dateTime);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");

  return `${year}-${month}-${day}T${hour}:${minute}`;
}

/*
 * datetime-local 값을 백엔드 OffsetDateTime 형태로 바꿔주는 함수야.
 *
 * 예:
 * 2026-06-28T10:30
 * → 2026-06-28T10:30:00+09:00
 */
export function toKstOffsetDateTime(localValue) {
  if (!localValue) return null;

  return `${localValue}:00+09:00`;
}

export function formatNoteDateOnly(value) {
  if (!value) return "-";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}