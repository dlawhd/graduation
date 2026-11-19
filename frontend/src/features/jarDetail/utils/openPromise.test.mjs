import test from "node:test";
import assert from "node:assert/strict";
import { buildOpenCalendar } from "./openPromise.mjs";

test("달력은 기기 시간대와 무관하게 같은 한국 시각에 열리고 한글 긴 줄도 접는다", () => {
  const previous = process.env.TZ;
  try {
    for (const zone of ["Asia/Seoul", "America/Los_Angeles", "UTC"]) {
      process.env.TZ = zone;
      const result = buildOpenCalendar({ jarId: 7, name: "우리 추억".repeat(30), openAt: "2030-12-01T10:00:00+09:00" }, 0);
      assert.match(result, /DTSTART:20301201T010000Z/);
      assert.match(result, /DTEND:20301201T013000Z/);
      assert.ok(result.split("\r\n").every(line => Buffer.byteLength(line) <= 75));
    }
  } finally { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous; }
});

test("제목의 쉼표·줄바꿈은 일정 속성으로 실행되지 않는다", () => {
  const result = buildOpenCalendar({ jarId: 7, name: "이름,;\\\r\nBEGIN:VEVENT", openAt: "2030-12-01T10:00" }, 0);
  assert.equal(result.match(/\r\nBEGIN:VEVENT\r\n/g).length, 1);
  assert.match(result, /SUMMARY:이름\\,\\;\\\\\\nBEGIN:VEVENT/);
  assert.throws(() => buildOpenCalendar({ jarId: -1, openAt: "invalid" }));
});
