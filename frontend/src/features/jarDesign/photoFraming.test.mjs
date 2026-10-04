import test from "node:test";
import assert from "node:assert/strict";
import { JAR_BODIES } from "./jarBodies.mjs";
import { WHOLE_PHOTO, coverPhotoFrame, containPhotoFrame, normalizePhotoFrame, photoFrameStyle, photoFrameControls, samePhotoFrame, validPhotoFrame } from "./photoFraming.mjs";

test("30개 사진 창 모두 원본 안에서 빈틈없이 채우고 원본 비율을 유지한다", () => {
  for (const body of JAR_BODIES) for (const source of [WHOLE_PHOTO, {x:0,y:.21875,width:1,height:.5625}, {x:.25,y:0,width:.5,height:1}]) {
    for (const zoom of [1, 1.01, 2, 4]) for (const x of [0,.5,1]) for (const y of [0,.5,1]) {
      const frame = coverPhotoFrame(body.window, source, zoom, x, y);
      assert.ok(validPhotoFrame(frame), body.id);
      assert.ok(frame.x >= source.x-.000001 && frame.y >= source.y-.000001);
      assert.ok(frame.x+frame.width <= source.x+source.width+.000001);
      assert.ok(frame.y+frame.height <= source.y+source.height+.000001);
      assert.ok(Math.abs(frame.width/frame.height - body.window.width/body.window.height) < .00006);
    }
  }
});
test("CSS는 저장한 사각형이 사진 창 전체로 매핑되고 contain을 남기지 않는다", () => {
  const f = {x:.2,y:.3,width:.4,height:.2}, style = photoFrameStyle(f);
  assert.equal(style.width,"250%"); assert.equal(style.height,"500%");
  assert.equal(style.left,"-50%"); assert.equal(style.top,"-150%"); assert.equal(style.objectFit,"fill");
});
test("기존 NULL, NaN, 음수, 영역 밖 배치는 기존 표시로 돌아간다", () => {
  for (const f of [null,{}, {...WHOLE_PHOTO,x:NaN},{...WHOLE_PHOTO,width:0},{...WHOLE_PHOTO,x:.2},{...WHOLE_PHOTO,y:-1}]) assert.equal(photoFrameStyle(f),null);
});
test("드래그가 원본 밖으로 나가지 않으며 저장·복원으로 배치가 달라지지 않는다", () => {
  const source = {x:0,y:.25,width:1,height:.5};
  for (const body of JAR_BODIES) {
    const saved = coverPhotoFrame(body.window,source,2,.73,.11);
    const c = photoFrameControls(saved,body.window,source);
    const restored = coverPhotoFrame(body.window,source,c.zoom,c.x,c.y);
    // 표시 슬라이더 역산은 6자리 DB 반올림의 1단위 안에서만 차이 난다. 실제 저장 복원은 사각형 자체를 사용한다.
    for (const key of ["x","y","width","height"]) assert.ok(Math.abs(saved[key]-restored[key]) < .0000011, body.id);
    assert.ok(samePhotoFrame(saved, JSON.parse(JSON.stringify(saved))));
    const edge = normalizePhotoFrame({...saved,x:10,y:-10},source);
    assert.ok(edge.x+edge.width <= 1.000001 && edge.y >= .25);
  }
});
test("정규화된 1px 폭 사진도 확대와 모양 변경에서 유효한 영역을 만든다", () => {
  for (const body of JAR_BODIES) {
    const frame = coverPhotoFrame(body.window,{x:.497917,y:0,width:.002083,height:1},4);
    assert.ok(validPhotoFrame(frame));
  }
});

test("전체 보기는 30개 창에서 가로·세로·정사각 사진을 자르거나 늘이지 않는다", () => {
  for (const body of JAR_BODIES) for (const source of [WHOLE_PHOTO, {x:0,y:.21875,width:1,height:.5625}, {x:.25,y:0,width:.5,height:1}]) {
    const frame = containPhotoFrame(source), style = photoFrameStyle(frame, body.window);
    assert.deepEqual(frame, {...source,fit:"CONTAIN"});
    const w = parseFloat(style.width)/100 * frame.width, h = parseFloat(style.height)/100 * frame.height;
    assert.ok(w <= 1.000001 && h <= 1.000001);
    assert.ok(Math.max(w,h) > .65);
    const radius=body.window.radius;
    const dx=Math.max(0,radius-(1-w)*body.window.width/2), dy=Math.max(0,radius-(1-h)*body.window.height/2);
    assert.ok(dx*dx+dy*dy <= radius*radius+.001, body.id);
    assert.ok(Math.abs(w*body.window.width/(h*body.window.height)-frame.width/frame.height) < .000001);
    const left = parseFloat(style.left)/100 + frame.x*parseFloat(style.width)/100;
    const top = parseFloat(style.top)/100 + frame.y*parseFloat(style.height)/100;
    assert.ok(Math.abs(left-(1-w)/2) < .000001);
    assert.ok(Math.abs(top-(1-h)/2) < .000001);
  }
});
test("같은 좌표라도 방식 변경은 실제 변경이며 V39 미지정은 COVER와 같다", () => {
  assert.ok(samePhotoFrame(WHOLE_PHOTO,{...WHOLE_PHOTO,fit:"COVER"}));
  assert.ok(!samePhotoFrame(WHOLE_PHOTO,containPhotoFrame()));
  assert.ok(samePhotoFrame(containPhotoFrame(), JSON.parse(JSON.stringify(containPhotoFrame()))));
  assert.deepEqual(photoFrameStyle(WHOLE_PHOTO),photoFrameStyle({...WHOLE_PHOTO,fit:"COVER"},{width:300,height:100}));
});
