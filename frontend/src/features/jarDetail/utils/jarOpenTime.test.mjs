import test from "node:test";
import assert from "node:assert/strict";
import { formatJarOpenTime, isFutureJarOpenTime, jarOpenTimeAfterDays } from "./jarOpenTime.mjs";

test("server offsets and legacy KST timestamps display the same Korean wall time", () => {
  for (const timestamp of ["2026-12-01T10:00:00+09:00", "2026-12-01T01:00:00Z", "2026-12-01T10:00:00"]) {
    assert.equal(formatJarOpenTime(timestamp), "2026-12-01T10:00");
  }
  assert.equal(formatJarOpenTime("bad"), "");
});

test("only real KST dates after the current instant pass validation", () => {
  const now = Date.parse("2026-12-01T01:00:00Z");
  assert.equal(isFutureJarOpenTime("2026-12-01T10:00", now), false);
  assert.equal(isFutureJarOpenTime("2026-12-01T10:01", now), true);
  assert.equal(isFutureJarOpenTime("2027-02-29T10:01", now), false);
  assert.equal(isFutureJarOpenTime("2027-01-01T24:00", now), false);
});

test("preset adds Korean calendar days across the midnight and year boundary", () => {
  assert.equal(jarOpenTimeAfterDays(7, Date.parse("2026-12-31T14:59:00Z")), "2027-01-07T23:59");
  assert.equal(jarOpenTimeAfterDays(7, Date.parse("2026-12-31T15:00:00Z")), "2027-01-08T00:00");
});
