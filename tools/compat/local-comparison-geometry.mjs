/** 각 역사 버전의 모양 생성 코드를 그대로 불러와 동일 입력의 좌표·법선·UV·삼각형을 비교한다. */
import assert from "node:assert/strict";
import {readFileSync,writeFileSync} from "node:fs";
import {join} from "node:path";
import {pathToFileURL} from "node:url";
import {createHash} from "node:crypto";
import {validateRoot,commitsFor} from "./local-comparison.mjs";
const root=validateRoot(process.argv[2]);
const manifest=JSON.parse(readFileSync(join(root,"run-public.json"),"utf8"));
assert.deepEqual(manifest.commits,commitsFor(manifest.baseline));
const fixture=JSON.parse(readFileSync(join(root,"design.json"),"utf8"));
const results={};
for(const variant of ["before","after"]){
  const base=join(root,variant,"frontend/src/features/jarDesign");
  const {roundedBodyGeometry}=await import(pathToFileURL(join(base,"body3DMesh.mjs")));
  const {body3DProfile}=await import(pathToFileURL(join(base,"body3DGeometry.mjs")));
  const body=structuredClone(fixture.customBody),geometry=roundedBodyGeometry(body,false,body3DProfile(body));
  try{
    const attributes={};
    for(const name of ["position","normal","uv"]){
      const a=geometry.attributes[name].array;
      attributes[name]=createHash("sha256").update(Buffer.from(a.buffer,a.byteOffset,a.byteLength)).digest("hex");
    }
    const a=geometry.index.array;
    results[variant]={commit:manifest.commits[variant],vertices:geometry.attributes.position.count,triangles:a.length/3,attributes,
      indexSha256:createHash("sha256").update(Buffer.from(a.buffer,a.byteOffset,a.byteLength)).digest("hex"),groups:geometry.groups};
  }finally{geometry.dispose();}
}
const {before,after}=results;
const identical=JSON.stringify({...before,commit:null})===JSON.stringify({...after,commit:null});
const result={scope:"SYNTHETIC_INPUT_GEOMETRY_ONLY",identical,workingFrontendFiles:manifest.workingFrontendFiles||null,results};
writeFileSync(join(root,"geometry-public.json"),JSON.stringify(result,null,2));
console.log(JSON.stringify(result));
