import { storedSlot, sameSlot } from "./slotGeometry.mjs";

/** 사진 배치용 자동 선택과 사용자가 확정한 디자인 선택을 구분하는 제작 순서 규칙이다. */
export function designSelectionKey(draft) {
  if (draft?.selectedDesignType === "ORIGINAL") return "ORIGINAL";
  if (draft?.selectedDesignType === "AI" && draft.selectedGenerationId != null) return `AI:${draft.selectedGenerationId}`;
  return null;
}

/** 후보를 직접 선택한 뒤에만 디테일을 열되, 이미 입구를 저장한 Draft는 이어서 편집한다. */
export function canEditDesignDetails(draft, confirmedSelectionKey) {
  if (draft?.selectedDesignType === "BODY_ONLY") return draft.status === "ACTIVE";
  const key = designSelectionKey(draft);
  return Boolean(draft?.status === "ACTIVE" && key
    && (key === confirmedSelectionKey || storedSlot(draft)));
}

/** 기본 추천 입구를 보여준 것만으로 편집 취소 경고를 띄우지 않는다. 최초 저장은 별도로 필요하다. */
export function hasSlotEdits(slot, savedSlot, initialSlot) {
  return !sameSlot(slot, savedSlot || initialSlot);
}

export const DESIGN_STEPS = ["틀 만들기 또는 선택", "그림 담기", "사진 배치와 AI 꾸미기", "투입구와 배경", "이름 붙이기"];
export const BODY_ONLY_DESIGN_STEPS = ["틀 만들기 또는 선택", "투입구 설정", "이름 붙이기"];

/** 서버에 저장된 배치와 이 계정이 확정한 선택을 기준으로 실제 복구할 단계를 안내한다. */
export function resumableDesignStep(draft, confirmedSelection, savedStep) {
  if (!draft) return 3;
  if (draft.selectedDesignType === "BODY_ONLY") return savedStep === 5 ? 5 : 4;
  const needsComposition = Boolean(draft.bodyStyle && !draft.photoFrame);
  return canEditDesignDetails(draft, confirmedSelection) && !needsComposition ? savedStep === 5 ? 5 : 4 : 3;
}
