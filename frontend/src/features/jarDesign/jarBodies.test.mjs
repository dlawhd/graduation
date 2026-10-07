import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { JAR_BODIES, JAR_BODY_COLLECTIONS, SELECTABLE_JAR_BODIES, getJarBody, jarBodyWindowPath, filterJarBodies } from "./jarBodies.mjs";
import { normalizeSlot, slotDimensions } from "./slotGeometry.mjs";

test("50 stable, distinct bodies share the server and V41 migration contract", () => {
  const ids = JAR_BODIES.map((body) => body.id);
  assert.equal(ids.length, 50);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(new Set(JAR_BODIES.map((body) => body.path)).size, ids.length);
  const java = readFileSync(new URL("../../../../src/main/java/shop/esjh/memoryjar/enums/ai/JarBodyStyle.java", import.meta.url), "utf8");
  const enumIds = java.split(/enum JarBodyStyle\s*\{/)[1].split("}")[0].match(/\b[A-Z][A-Z_]+\b/g);
  assert.deepEqual(enumIds.filter(id=>id!=="CUSTOM").sort(), [...ids].sort());
  const sql = readFileSync(new URL("../../../../src/main/resources/db/migration/V41__add_animal_jar_bodies.sql", import.meta.url), "utf8");
  assert.deepEqual([...sql.matchAll(/'([A-Z_]+)'/g)].map((match) => match[1]).sort(), [...ids, ...ids].sort());
  const legacySql = readFileSync(new URL("../../../../src/main/resources/db/migration/V38__add_jar_body_style.sql", import.meta.url), "utf8");
  assert.deepEqual([...legacySql.matchAll(/'([A-Z_]+)'/g)].map(m=>m[1]).sort(), [...ids.slice(0,30),...ids.slice(0,30)].sort());
});

test("windows and recommended slots stay inside the shared 480 coordinate frame", () => {
  for (const body of JAR_BODIES) {
    assert.ok(body.collection);
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
  const geometry = JAR_BODIES.slice(0,30).map(({ id, path, window, slot }) => ({ id, path, window, slot }));
  assert.equal(createHash("sha256").update(JSON.stringify(geometry)).digest("hex"), "82764fa855042e0c97eff208ea9367d36f0c09cb823c1f42560807ac2d988301");
});

test("all objects have distinct complete finishes and valid gallery colors", () => {
  assert.equal(new Set(JAR_BODIES.map((body) => JSON.stringify(body.colors))).size, JAR_BODIES.length);
  assert.equal(new Set(JAR_BODIES.map((body) => body.detail)).size, JAR_BODIES.length);
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

test("new animal collection and local search combine without changing catalog or selection", () => {
  assert.equal(filterJarBodies("새 동물 친구").length,20);
  assert.equal(filterJarBodies("다정한 친구").length,27);
  assert.deepEqual(filterJarBodies("새 동물 친구","아 홀 로 틀").map(b=>b.id),["AXOLOTL"]);
  assert.deepEqual(filterJarBodies("전체","  shiba  ").map(b=>b.id),["SHIBA"]);
  assert.deepEqual(filterJarBodies("전체","강아지").map(b=>b.id),["SHIBA","CORGI"]);
  assert.deepEqual(filterJarBodies("전체","너구리").map(b=>b.id),["RACCOON"]);
  assert.deepEqual(filterJarBodies("전체","우파루파").map(b=>b.id),["AXOLOTL"]);
  assert.ok(filterJarBodies("전체","도자기").length > 20);
  assert.deepEqual(filterJarBodies("작은 보석","코기"),[]);
  assert.deepEqual(filterJarBodies("전체","없는모양"),[]);
  assert.equal(getJarBody("CORGI").id,"CORGI");
  assert.equal(filterJarBodies("전체","  ").length,28);
});

test("removed collections and two objects cannot be selected, but saved geometry remains readable", () => {
  assert.deepEqual(JAR_BODY_COLLECTIONS,["다정한 친구","숲속의 선물"]);
  assert.equal(SELECTABLE_JAR_BODIES.length,28);
  for (const id of ["CLASSIC","STAR","PLANET","MUSHROOM","FLOWER"]) {
    assert.ok(getJarBody(id));
    assert.ok(!SELECTABLE_JAR_BODIES.some(body=>body.id===id));
  }
  for (const collection of ["유리와 도자기","작은 보석","꿈꾸는 오브제"]) assert.deepEqual(filterJarBodies(collection),[]);
});

test("each new animal has its own face renderer and a real window emblem", () => {
  const artwork=readFileSync(new URL("./components/AnimalBodyArtwork.jsx",import.meta.url),"utf8");
  const faces=artwork.slice(artwork.lastIndexOf("  switch (id) {")).split("    default:")[0];
  const faceIds=[...faces.matchAll(/case "([A-Z_]+)"/g)].map(m=>m[1]);
  assert.deepEqual(faceIds.sort(),JAR_BODIES.filter(b=>b.newAnimal).map(b=>b.id).sort());
  for (const body of JAR_BODIES.filter(b=>b.newAnimal)) assert.ok(artwork.includes(`${body.emblem}:() =>`),body.id);
  const renderer=readFileSync(new URL("./components/JarBodyArtwork.jsx",import.meta.url),"utf8");
  assert.match(renderer,/data-jar-photo-safe/);
  assert.match(renderer,/AnimalBodyDecorations body=\{body\} paint=\{paint\} layer=\{layer\}/);
});
