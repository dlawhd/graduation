import test from "node:test";
import assert from "node:assert/strict";
import { looksLikeAddress, normalizeAddressResults, searchAddress, placeSelectionLabel } from "./addressSearch.mjs";

const row = (overrides = {}) => ({ roadAddress: "경기도 용인시 처인구 시험로256번길 47-16", jibunAddress: "경기도 용인시 처인구 시험동 123-4", x: "127.2", y: "37.3", ...overrides });
const response = (...rows) => ({ v2: { addresses: rows } });
const sdk = geocode => ({ Service: { Status: { OK: "OK" }, geocode } });

test("도로명·건물번호와 지번은 주소 검색을 먼저 사용한다", () => {
  for (const query of [row().roadAddress, "서울 성동구 시험대로 10", "서울 성동구 성수동1가 42-1", "경기도 시험리 산 12-3"]) assert.equal(looksLikeAddress(query), true, query);
  for (const query of ["서울숲", "호호식당 익선", "음식점", "서울 성수동 카페", "시험로 카페"]) assert.equal(looksLikeAddress(query), false, query);
});
test("도로명 우선·지번 보조 표시와 좌표 변환", () => {
  const [place] = normalizeAddressResults(response(row()));
  assert.equal(place.kind, "ADDRESS"); assert.equal(place.address, row().roadAddress);
  assert.equal(place.secondaryAddress, row().jibunAddress);
  assert.equal(place.longitude, 127.2); assert.equal(place.latitude, 37.3);
});
test("도로명이 없으면 지번을 사용하고 빈 결과도 허용한다", () => {
  assert.equal(normalizeAddressResults(response(row({ roadAddress: "" })))[0].address, row().jibunAddress);
  assert.deepEqual(normalizeAddressResults(response()), []);
});
test("주소·좌표가 잘못된 결과는 지도에 표시하지 않는다", () => {
  const invalid = [null, {}, row({ roadAddress: "", jibunAddress: "" }), row({ x: "" }), row({ x: "127evil" }), row({ y: "NaN" }), row({ x: "181" }), row({ y: "91" })];
  assert.deepEqual(normalizeAddressResults(response(...invalid)), []);
});
test("동일 결과 중복은 제거하고 최대 5개만 반환한다", () => {
  const rows = [row(), row(), ...Array.from({ length: 9 }, (_, i) => row({ roadAddress: `시험로 ${i}` }))];
  assert.equal(normalizeAddressResults(response(...rows)).length, 5);
  assert.equal(normalizeAddressResults(response(row(), row())).length, 1);
});
test("성공 응답이라도 결과 구조가 잘못되면 오류로 처리한다", () => {
  for (const value of [null, {}, { v2: { addresses: {} } }]) assert.throws(() => normalizeAddressResults(value), /ADDRESS_SEARCH_FAILED/);
});
test("주소는 주소 자체로, 상호명은 이름과 주소를 쉼표로 연결한다", () => {
  assert.equal(placeSelectionLabel(normalizeAddressResults(response(row()))[0]), row().roadAddress);
  assert.equal(placeSelectionLabel({ name: "함께 카페", address: "서울 시험로 1" }), "함께 카페, 서울 시험로 1");
});
test("SDK의 query와 공식 응답 형식을 사용한다", async () => {
  const maps = sdk((options, callback) => { assert.deepEqual(options, { query: "시험로 1" }); callback("OK", response(row())); });
  assert.equal((await searchAddress(maps, "시험로 1"))[0].address, row().roadAddress);
});
test("빈 주소 결과는 정상적인 빈 목록이다", async () => {
  assert.deepEqual(await searchAddress(sdk((_, cb) => cb("OK", response())), "없음"), []);
});
test("권한·외부 오류에는 외부 응답 원문을 노출하지 않는다", async () => {
  await assert.rejects(searchAddress(sdk((_, cb) => cb("ERROR", { secret: "private" })), "비공개 주소"), { message: "ADDRESS_SEARCH_FAILED" });
});
test("SDK 동기 예외와 잘못된 응답도 안전한 오류로 바꾼다", async () => {
  await assert.rejects(searchAddress(sdk(() => { throw new Error("provider private value"); }), "주소"), { message: "ADDRESS_SEARCH_FAILED" });
  await assert.rejects(searchAddress(sdk((_, cb) => cb("OK", {})), "주소"), { message: "ADDRESS_SEARCH_FAILED" });
});
test("SDK가 없으면 대기하지 않고 오류를 반환한다", async () => {
  await assert.rejects(searchAddress({}, "주소"), { message: "ADDRESS_SEARCH_FAILED" });
});
test("무응답은 제한 시간 후 실패하고 늦은 콜백을 무시한다", async () => {
  let callback;
  const pending = searchAddress(sdk((_, cb) => { callback = cb; }), "주소", undefined, 10);
  await assert.rejects(pending, { message: "ADDRESS_SEARCH_TIMEOUT" });
  assert.doesNotThrow(() => callback("OK", response(row())));
});
test("미리 취소되면 SDK를 호출하지 않는다", async () => {
  const controller = new AbortController(); controller.abort();
  let calls = 0;
  await assert.rejects(searchAddress(sdk(() => calls++), "주소", controller.signal), { name: "AbortError" });
  assert.equal(calls, 0);
});
test("요청 중 취소하면 늦은 SDK 응답은 사용하지 않는다", async () => {
  const controller = new AbortController(); let callback;
  const pending = searchAddress(sdk((_, cb) => { callback = cb; }), "주소", controller.signal);
  controller.abort();
  await assert.rejects(pending, { name: "AbortError" });
  assert.doesNotThrow(() => callback("OK", response(row())));
});
test("SDK가 콜백을 두 번 불러도 최초 결과를 유지한다", async () => {
  const places = await searchAddress(sdk((_, cb) => { cb("OK", response(row())); cb("ERROR", null); }), "주소");
  assert.equal(places[0].address, row().roadAddress);
});
