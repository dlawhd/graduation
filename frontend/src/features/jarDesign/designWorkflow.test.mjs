import test from "node:test";
import assert from "node:assert/strict";
import { designSelectionKey, canEditDesignDetails, hasSlotEdits } from "./designWorkflow.mjs";
import { normalizeSlot, sameSlot } from "./slotGeometry.mjs";

const original = { status: "ACTIVE", selectedDesignType: "ORIGINAL", selectedGenerationId: null };
const ai = { ...original, selectedDesignType: "AI", selectedGenerationId: 12 };
const initialSlot = normalizeSlot({ centerX: .5, centerY: .25, sizeRatio: .4 });

test("배치용 자동 원본 선택은 입구/배경/최종화 단계를 열지 않는다", () => {
  assert.equal(canEditDesignDetails(original, null), false);
  assert.equal(canEditDesignDetails(null, null), false);
  assert.equal(canEditDesignDetails({ status: "ACTIVE" }, null), false);
});

test("원본 또는 AI 후보를 직접 확정하면 해당 선택의 디테일만 열린다", () => {
  assert.equal(canEditDesignDetails(original, designSelectionKey(original)), true);
  assert.equal(canEditDesignDetails(ai, designSelectionKey(ai)), true);
  assert.equal(canEditDesignDetails(ai, "ORIGINAL"), false);
  assert.equal(canEditDesignDetails({ ...ai, selectedGenerationId: 13 }, "AI:12"), false);
});

test("저장된 입구가 있는 이전 Draft는 새로고침 후에도 편집을 이어간다", () => {
  assert.equal(canEditDesignDetails({ ...ai, slotCenterX: .5, slotCenterY: .3, slotSizeRatio: 0 }, null), true);
  assert.equal(canEditDesignDetails({ ...ai, slotCenterX: null, slotCenterY: null, slotSizeRatio: null }, null), false);
});

test("기본/완료/만료 Draft는 디테일 편집으로 진입하지 않는다", () => {
  for (const status of ["FINALIZED", "EXPIRED"]) assert.equal(canEditDesignDetails({ ...original, status }, "ORIGINAL"), false);
  assert.equal(canEditDesignDetails({ ...original, selectedDesignType: "DEFAULT" }, "ORIGINAL"), false);
});

test("AI 후보 추가만으로 편집 단계나 현재 선택은 바뀌지 않는다", () => {
  const generated = { ...original, generations: [{ generationId: 12, status: "SUCCEEDED" }] };
  assert.equal(canEditDesignDetails(generated, null), false);
  assert.equal(canEditDesignDetails(generated, "ORIGINAL"), true);
  assert.equal(designSelectionKey(generated), "ORIGINAL");
});

test("최초 기본 입구는 실제 수정이 아니지만 여전히 저장이 필요하다", () => {
  assert.equal(hasSlotEdits(initialSlot, null, initialSlot), false);
  assert.equal(sameSlot(initialSlot, null), false);
});

test("위치/크기/모양 변경은 경고 대상이며 초기 상태로 돌리면 경고를 없앤다", () => {
  for (const changes of [{ centerX: .6 }, { centerY: .4 }, { sizeRatio: .2 }, { slotStyle: "WOOD" }]) {
    assert.equal(hasSlotEdits({ ...initialSlot, ...changes }, null, initialSlot), true);
  }
  assert.equal(hasSlotEdits({ ...initialSlot }, null, initialSlot), false);
});

test("저장 이후에는 마지막 저장값을 기준으로 실제 변경을 판단한다", () => {
  const saved = { ...initialSlot, centerX: .7 };
  assert.equal(hasSlotEdits(saved, saved, initialSlot), false);
  assert.equal(hasSlotEdits(initialSlot, saved, initialSlot), true);
});
