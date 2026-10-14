import test from "node:test";
import assert from "node:assert/strict";
import { hexToHsv, hsvToHex, isHexColor } from "./colorSelection.mjs";

test("기본색·무채색·사용자 색의 HSV 왕복 변환은 실제 펜 색을 보존한다", () => {
  for (const hex of ["#000000", "#ffffff", "#ff0000", "#00ff00", "#0000ff", "#d7e9df", "#14b8a6", "#ed2282", "#334155"]) assert.equal(hsvToHex(hexToHsv(hex)), hex);
  for (let r=0;r<256;r+=51) for(let g=0;g<256;g+=51) for(let b=0;b<256;b+=51) {
    const hex="#"+[r,g,b].map(n=>n.toString(16).padStart(2,"0")).join("");
    assert.equal(hsvToHex(hexToHsv(hex)),hex);
  }
});
test("색상 영역의 밝기·채도 경계와 무지개 양 끝을 처리한다", () => {
  assert.equal(hsvToHex({h:120,s:0,v:1}),"#ffffff");
  assert.equal(hsvToHex({h:120,s:1,v:0}),"#000000");
  assert.equal(hsvToHex({h:360,s:1,v:1}),"#ff0000");
  assert.equal(hsvToHex({h:-120,s:2,v:2}),"#0000ff");
});
test("미완성·유효하지 않은 색상 코드는 거부한다", () => {
  for (const hex of ["#12", "#gggggg", "red", "#1234567", null, ""]) { assert.equal(isHexColor(hex),false); assert.equal(hexToHsv(hex),null); }
  assert.ok(isHexColor("#ABCDEF"));
});
