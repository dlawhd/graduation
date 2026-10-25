import { createHash } from "node:crypto";
import { basicBodyOutline } from "../../src/features/jarDesign/customJarBody.mjs";
import { DEEP_BODY_FIXTURE, POINTED_BODY_FIXTURE, narrowBodyFixture } from "./body3DShapes.mjs";
import { IRREGULAR_BODY_OUTLINE } from "./irregularBodyOutline.mjs";

/** 최적화 전후를 같은 입력으로 비교한다. 사진·인증정보 없이 외곽선과 빈 틀 여부만 사용한다. */
export function body3DRegressionCases() {
  const values=[...["ROUND","JAR","SQUARE"].map(id=>[id,basicBodyOutline(id)]),
    ["IRREGULAR",IRREGULAR_BODY_OUTLINE],["DEEP",DEEP_BODY_FIXTURE],["POINTED",POINTED_BODY_FIXTURE],
    ["NARROW",narrowBodyFixture()]];
  return values.flatMap(([id,value])=>[false,true].map(hollow=>({id:`${id}:${hollow?"hollow":"filled"}`,value:structuredClone(value),hollow})))
    .concat({id:"IRREGULAR:reversed",value:{...structuredClone(IRREGULAR_BODY_OUTLINE),points:IRREGULAR_BODY_OUTLINE.points.toReversed()},hollow:false});
}

/** 좌표·법선·UV·삼각형·재질 그룹의 바이트를 대조한다. 속도가 달라져도 모양이 달라지면 실패한다. */
export function body3DGeometrySignature(geometry) {
  const hash=createHash("sha256");
  for(const name of ["position","normal","uv"]) {
    const array=geometry.attributes[name].array;
    hash.update(name);hash.update(Buffer.from(array.buffer,array.byteOffset,array.byteLength));
  }
  const indices=geometry.index.array;
  hash.update(Buffer.from(indices.buffer,indices.byteOffset,indices.byteLength));
  hash.update(JSON.stringify(geometry.groups));
  return {sha256:hash.digest("hex"),vertices:geometry.attributes.position.count,triangles:geometry.index.count/3};
}
