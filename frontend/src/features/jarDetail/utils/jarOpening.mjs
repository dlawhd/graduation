/** 오픈 연출은 서버가 이미 공개한 현재 저금통에서만 표시한다. 연출 자체는 공개 권한을 바꾸지 않는다. */
export function canShowJarOpening(open, jar, event) {
  const jarId = Number(jar?.jarId);
  return Boolean(open && jar?.isOpen === true && Number.isSafeInteger(jarId) && jarId > 0
    && (event?.jarId == null || Number(event.jarId) === jarId));
}

export const OPENING_IMPACT_MS = 280;
export const OPENING_HIT_MS = 900;
export const initialOpening = { hits: 0, damage: 0, phase: "ready" };

/** 타격 입력과 실제 접촉을 구분한다. 망치가 닿기 전에는 금이 생기지 않으며 늦은 타이머도 진행을 되돌리지 못한다. */
export function openingReducer(state, action) {
  if (action.type === "SKIP") return { hits: 3, damage: 3, phase: "complete" };
  if (action.type === "HIT" && state.phase === "ready" && state.hits < 3) return { ...state, hits: state.hits + 1, phase: "tapping" };
  if (action.type === "IMPACT" && state.phase === "tapping" && action.hit === state.hits) return { ...state, damage: state.hits };
  if (action.type === "SETTLE" && state.phase === "tapping" && action.hit === state.hits) {
    return { hits: state.hits, damage: state.hits, phase: state.hits === 3 ? "complete" : "ready" };
  }
  return state;
}
