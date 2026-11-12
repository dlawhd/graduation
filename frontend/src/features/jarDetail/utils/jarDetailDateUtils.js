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

export function formatDate(dateTime, timeZone) {
  if (!dateTime) return "-";

  const date = new Date(dateTime);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return date.toLocaleString("ko-KR", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
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