import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('사진 초기화는 조절 영역 제목 옆에 두고 비율 안내는 제거한다',()=>{
  const editor=readFileSync(new URL('./components/PhotoFrameEditor.jsx',import.meta.url),'utf8');
  const controls=editor.indexOf('data-photo-adjustments'),reset=editor.indexOf('>초기화</button>'),zoom=editor.indexOf('aria-label="사진 확대"');
  assert.ok(controls<reset&&reset<zoom);
  assert.ok(!editor.includes('사진 창 비율'));
  assert.ok(editor.includes('setFrame(coverPhotoFrame(body.window, source))'));
});

test('신규 동물 필터·NEW 배지와 전체 보기의 개수 표시는 제거한다',()=>{
  const picker=readFileSync(new URL('./components/JarBodyPicker.jsx',import.meta.url),'utf8');
  const character=readFileSync(new URL('./components/CharacterShapePicker.jsx',import.meta.url),'utf8');
  assert.ok(!picker.includes('새 동물 친구'));assert.ok(!picker.includes('NEW'));
  assert.ok(character.includes('>전체 보기</button>'));
  assert.ok(!character.includes('전체 보기 ·'));
});

test('사진 배치의 양쪽 제목을 이미지 밖에 두고 비교 영역을 같은 정사각형으로 맞춘다',()=>{
  const editor=readFileSync(new URL('./components/PhotoFrameEditor.jsx',import.meta.url),'utf8');
  assert.ok(editor.includes('data-photo-comparison'));
  assert.ok(editor.includes('data-photo-applied-stage className="grid aspect-square place-items-center'));
  assert.ok(editor.indexOf('적용하면 이렇게 보여요')<editor.indexOf('data-photo-applied-stage'));
  assert.ok(editor.includes('relative mx-auto w-full max-w-[420px]'));
  assert.ok(editor.includes('id="photo-drag-help" className="mt-2'));
});

test('도형 분류 탭에는 이름만 표시하고 그림 담기 카드 밑선도 맞춘다',()=>{
  const source=path=>readFileSync(new URL(path,import.meta.url),'utf8');
  const dialog=source('./components/ShapeSelectionDialog.jsx'),css=source('./bodyWorkshop.css'),page=source('../../pages/JarDesignNewPage.jsx');
  assert.ok(dialog.includes('>{label}</button>'));
  assert.ok(!dialog.includes('{label} · {count}'));
  assert.ok(css.includes('.image-input-studio .studio-workspace { align-items: stretch; }'));
  assert.ok(css.includes('.studio-editor:not([hidden])'));
  assert.ok(page.includes('className="studio-editor min-w-0"'));
});

test('틀 그림판의 보조 안내는 제거하고 도구 설명과 사진 그림판 안내는 유지한다',()=>{
  const canvas=readFileSync(new URL('./components/JarDesignCanvas.jsx',import.meta.url),'utf8');
  assert.ok(!canvas.includes('닫힌 테두리로 연결된 틀 / 점선 안쪽에 그려주세요'));
  assert.ok(!canvas.includes('그린 테두리의 색과 굵기를 그대로 담아요.'));
  assert.ok(canvas.includes('text-slate-600">{help}</p>'));
  assert.ok(canvas.includes('{!isBody && <p'));
  assert.ok(canvas.includes('480 × 480 PNG · 최대 25단계 되돌리기 · Ctrl+Z / Ctrl+Shift+Z'));
});

test('완성 커스텀 저금통의 확대 상한과 쪽지 버튼 위치는 기존 기본 테마와 분리한다',()=>{
  const detail=readFileSync(new URL('../jarDetail/components/JarVisual.jsx',import.meta.url),'utf8');
  const list=readFileSync(new URL('../../pages/JarsPage.jsx',import.meta.url),'utf8');
  assert.match(detail,/aspect-square w-full max-w-\[420px\]/);
  assert.match(detail,/hasCustomDesign \? "-bottom-7" : "bottom-2"/);
  assert.match(detail,/h-\[320px\] w-\[260px\]/);
  assert.match(list,/max-w-\[280px\]/);
  assert.match(list,/md:w-\[280px\] md:shrink-0/);
});

test('선택 미리보기를 확대하면서 아주 낮은 화면에서도 버튼 접근을 보장한다',()=>{
  const css=readFileSync(new URL('./jarBodyPicker.css',import.meta.url),'utf8');
  const picker=readFileSync(new URL('./components/JarBodyPicker.jsx',import.meta.url),'utf8');
  assert.match(css,/max-height: calc\(100dvh - 112px\)/);
  assert.match(css,/overflow-y: auto/);
  assert.match(css,/width: min\(100%, 260px\)/);
  assert.match(css,/clamp\(140px, calc\(100dvh - 430px\), 260px\)/);
  assert.ok(picker.includes('lg:grid-cols-[minmax(0,1fr)_340px]'));
  assert.match(picker,/aria-label="선택한 저금통 미리보기"/);
  assert.match(picker,/이 저금통에 그림 담기/);
});

test('상단 AI 선택 안내는 화면 너비와 관계없이 새 줄에 표시한다',()=>{
  const page=readFileSync(new URL('../../pages/JarDesignNewPage.jsx',import.meta.url),'utf8');
  assert.ok(page.includes('<span className="block">AI 변환은 선택 사항이에요.</span>'));
});

test('회전 안내는 작게 줄이되 두 방향 버튼과 설명을 유지한다',()=>{
  const viewer=readFileSync(new URL('./components/CustomJarBody3D.jsx',import.meta.url),'utf8');
  assert.ok(viewer.includes('data-rotation-controls'));
  assert.equal((viewer.match(/h-8 w-8 shrink-0/g)||[]).length,2);
  assert.ok(viewer.includes('3D 왼쪽으로 돌리기'));assert.ok(viewer.includes('3D 오른쪽으로 돌리기'));
  assert.ok(viewer.includes('드래그로 돌려보기'));
});
