import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { JAR_BODIES, JAR_BODY_COLLECTIONS, getJarBody, jarBodyWindowPath } from "./jarBodies.mjs";
import { normalizeSlot, slotDimensions } from "./slotGeometry.mjs";

test("30 stable, distinct bodies share the server and migration contract", () => {
  const ids = JAR_BODIES.map((body) => body.id);
  assert.equal(ids.length, 30);
  assert.equal(new Set(ids).size, 30);
  assert.equal(new Set(JAR_BODIES.map((body) => body.path)).size, 30);
  const java = readFileSync(new URL("../../../../src/main/java/shop/esjh/memoryjar/enums/ai/JarBodyStyle.java", import.meta.url), "utf8");
  const enumIds = java.split(/enum JarBodyStyle\s*\{/)[1].split("}")[0].match(/\b[A-Z][A-Z_]+\b/g);
  assert.deepEqual([...enumIds].sort(), [...ids].sort());
  const sql = readFileSync(new URL("../../../../src/main/resources/db/migration/V38__add_jar_body_style.sql", import.meta.url), "utf8");
  assert.deepEqual([...sql.matchAll(/'([A-Z_]+)'/g)].map((match) => match[1]).sort(), [...ids, ...ids].sort());
});

test("windows and recommended slots stay inside the shared 480 coordinate frame", () => {
  for (const body of JAR_BODIES) {
    assert.ok(JAR_BODY_COLLECTIONS.includes(body.collection));
    assert.equal(getJarBody(body.id), body);
    const w = body.window;
    assert.ok(w.x >= 0 && w.y >= 0 && w.width > 0 && w.height > 0);
    assert.ok(w.x + w.width <= 480 && w.y + w.height <= 480);
    assert.ok(jarBodyWindowPath(w).endsWith("Z"));
    const slot = normalizeSlot(body.slot), { width, height } = slotDimensions(slot.sizeRatio);
    assert.ok(slot.centerX - width / 2 >= 0 && slot.centerX + width / 2 <= 1);
    assert.ok(slot.centerY - height / 2 >= 0 && slot.centerY + height / 2 <= 1);
  }
});

test("legacy and unknown IDs do not silently select a different jar", () => {
  for (const id of [null, undefined, "", "UNKNOWN", "cat"]) assert.equal(getJarBody(id), null);
});

test("appearance refresh keeps every saved silhouette, photo window and slot coordinate unchanged", () => {
  // 1b9894c의 도면 계약이다. 외형 개선 때문에 기존 그림이나 쪽지 입구 위치가 이동하면 안 된다.
  const geometry = JAR_BODIES.map(({ id, path, window, slot }) => ({ id, path, window, slot }));
  assert.equal(createHash("sha256").update(JSON.stringify(geometry)).digest("hex"), "82764fa855042e0c97eff208ea9367d36f0c09cb823c1f42560807ac2d988301");
});

test("all 30 objects have distinct complete finishes and valid gallery colors", () => {
  assert.equal(new Set(JAR_BODIES.map((body) => JSON.stringify(body.colors))).size, 30);
  assert.equal(new Set(JAR_BODIES.map((body) => body.detail)).size, 30);
  for (const body of JAR_BODIES) {
    assert.ok(body.detail.length > 4, body.id);
    assert.ok(body.material.length > 4, body.id);
    assert.ok(Object.isFrozen(body.colors));
    assert.ok(Object.isFrozen(body.stage));
    for (const color of [...Object.values(body.colors), ...Object.values(body.stage)]) {
      assert.match(color, /^#[0-9a-f]{6}$/i, body.id);
    }
  }
});
