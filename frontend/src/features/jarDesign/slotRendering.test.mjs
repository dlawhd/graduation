import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const source=path=>readFileSync(new URL(path,import.meta.url),"utf8");
test("최종 미리보기와 저장된 Jar는 공통 렌더러에 입구를 맡기고 중복하지 않는다",()=>{
  for(const path of ["./components/JarDesignFinalizePanel.jsx","../jarDetail/components/JarCustomDesignVisual.jsx"]){
    const code=source(path);
    assert.ok(!code.includes("<JarSlotOverlay"),path);
    assert.ok(code.includes("slot={"),path);
  }
});
test("이미지 단독 디자인도 공통 렌더러에서 입구를 보존한다",()=>{
  const code=source("./components/JarDesignImage.jsx");
  assert.ok(code.includes("{image}<JarSlotOverlay slot={slot}/></div> : image"));
});
test("상세 장식은 입력을 받지 않아도 3D 조작 영역은 입력을 받는다",()=>{
  const visual=source("../jarDetail/components/JarVisual.jsx"),viewer=source("./components/CustomJarBodyViewer.jsx");
  assert.ok(visual.includes("pointer-events-none absolute inset-0"));
  assert.ok(viewer.includes('data-view-controls className={`pointer-events-auto'));
  assert.ok(viewer.includes('className="pointer-events-auto absolute inset-0"'));
});
