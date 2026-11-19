import { formatJarOpenTime } from "./jarOpenTime.mjs";

// 달력 명령이나 줄바꿈을 이름에 넣어도 일정의 다른 필드를 덮어쓰지 못하게 한다.
export function calendarText(value) {
  return String(value ?? "").replace(/\\/g, "\\\\").replace(/\r\n|\r|\n/g, "\\n").replace(/;/g, "\\;").replace(/,/g, "\\,");
}
const stamp = value => new Date(value).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/** 한국 시간 입력을 절대 시각으로 바꿔 해외 기기의 달력에서도 같은 순간을 가리킨다. */
export function buildOpenCalendar(jar, now = Date.now()) {
  const local = formatJarOpenTime(jar.openAt);
  if (!local || !Number.isSafeInteger(Number(jar.jarId)) || Number(jar.jarId) <= 0) throw new Error("오픈 시간을 확인해 주세요.");
  const start = Date.parse(`${local}+09:00`);
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Memory Jar//Opening Promise//KO", "CALSCALE:GREGORIAN", "BEGIN:VEVENT",
    `UID:jar-${Number(jar.jarId)}@memoryjar`, `DTSTAMP:${stamp(now)}`, `DTSTART:${stamp(start)}`, `DTEND:${stamp(start + 30 * 60 * 1000)}`,
    `SUMMARY:${calendarText(`${jar.name} · 추억 여는 날`)}`, `DESCRIPTION:${calendarText("함께 모은 추억을 열어봐요. 오픈 시간은 한국 시간(KST) 기준이에요.")}`,
    "END:VEVENT", "END:VCALENDAR"];
  // RFC 5545의 한 줄 75바이트 제한은 한글에서도 지킨다.
  return lines.map(line => {
    let output = "", bytes = 0;
    for (const char of line) {
      const length = new TextEncoder().encode(char).length;
      if (bytes + length > 75) { output += "\r\n "; bytes = 1; }
      output += char; bytes += length;
    }
    return output;
  }).join("\r\n") + "\r\n";
}
