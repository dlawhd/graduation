import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { roundedBodyGeometry } from "./body3DMesh.mjs";
import { body3DRegressionCases, body3DGeometrySignature } from "../../../tests/fixtures/body3DRegression.mjs";

// 최적화 전 파일은 고정 기준이다. 결과가 바뀌면 기준을 갱신하지 말고 변경 원인을 확인한다.
const before=JSON.parse(readFileSync(new URL("../../../tests/fixtures/body3DGeometryBefore.json",import.meta.url),"utf8"));
for(const item of body3DRegressionCases())test(`최적화 전 모양 바이트 보존: ${item.id}`,()=>{
  const original=structuredClone(item.value),geometry=roundedBodyGeometry(item.value,item.hollow);
  try {
    assert.deepEqual(body3DGeometrySignature(geometry),before.cases[item.id]);
    assert.deepEqual(item.value,original);
  } finally {geometry.dispose();}
});
