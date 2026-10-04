import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('완성 커스텀 저금통의 확대 상한과 쪽지 버튼 위치는 기존 기본 테마와 분리한다',()=>{
  const detail=readFileSync(new URL('../jarDetail/components/JarVisual.jsx',import.meta.url),'utf8');
  const list=readFileSync(new URL('../../pages/JarsPage.jsx',import.meta.url),'utf8');
  assert.match(detail,/aspect-square w-full max-w-\[420px\]/);
  assert.match(detail,/hasCustomDesign \? "-bottom-7" : "bottom-2"/);
  assert.match(detail,/h-\[320px\] w-\[260px\]/);
  assert.match(list,/max-w-\[280px\]/);
  assert.match(list,/md:w-\[280px\] md:shrink-0/);
});

test('고정 미리보기의 전시 이미지 높이를 줄이고 아주 낮은 화면에서도 버튼 접근을 보장한다',()=>{
  const css=readFileSync(new URL('./jarBodyPicker.css',import.meta.url),'utf8');
  const picker=readFileSync(new URL('./components/JarBodyPicker.jsx',import.meta.url),'utf8');
  assert.match(css,/max-height: calc\(100dvh - 112px\)/);
  assert.match(css,/overflow-y: auto/);
  assert.match(css,/clamp\(120px, calc\(100dvh - 420px\), 190px\)/);
  assert.match(picker,/aria-label="선택한 저금통 미리보기"/);
  assert.match(picker,/이 저금통에 그림 담기/);
});
