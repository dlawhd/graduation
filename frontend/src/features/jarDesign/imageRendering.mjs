/** 픽셀 스타일만 최근접 표시를 사용한다. 이전 서버 응답에 스타일이 없어도 일반 표시는 유지한다. */
export function designImageRendering(aiStyle) {
  return aiStyle === "PIXEL" ? "pixelated" : "auto";
}

/** 원본 선택 시에는 이전 AI 후보의 스타일이 편집기에 남지 않도록 한다. */
export function draftImageRendering(draft) {
  const selected = draft?.selectedDesignType === "AI"
    ? draft.generations?.find((item) => item.generationId === draft.selectedGenerationId)
    : null;
  return designImageRendering(selected?.style);
}
