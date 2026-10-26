import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {roundedBodyGeometry} from "./body3DMesh.mjs";
import {preparedBodyProfile} from "./preparedBody3D.mjs";
import {getJarBody} from "./jarBodies.mjs";
import {body3DGeometrySignature} from "../../../tests/fixtures/body3DRegression.mjs";

// 공개 SVG의 실제 96점과 수정 전 d56d067의 모양 바이트다. 새 결과로 기준을 덮어쓰지 않는다.
const outlines=JSON.parse(readFileSync(new URL("../../../tests/fixtures/preparedBodyOutlines.json",import.meta.url),"utf8"));
const before=JSON.parse(readFileSync(new URL("../../../tests/fixtures/preparedBodyGeometryBefore.json",import.meta.url),"utf8"));
for(const item of outlines.cases)for(const hollow of [false,true]) {
  const id=`${item.id}:${hollow?"hollow":"filled"}`;
  test(`테두리 최적화 전 카탈로그 모양 보존: ${id}`,()=>{
    const body=getJarBody(item.id),original=structuredClone(item.value);
    assert.equal(body.path,item.catalogPath,"공개 도안이 바뀌면 기준 입력부터 다시 검토해야 합니다.");
    const geometry=roundedBodyGeometry(item.value,hollow,preparedBodyProfile(item.value,body));
    try {
      assert.deepEqual(body3DGeometrySignature(geometry),before.cases[id]);
      assert.deepEqual(item.value,original);
    } finally {geometry.dispose();}
  });
}
