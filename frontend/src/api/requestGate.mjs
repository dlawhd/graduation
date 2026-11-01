/** 같은 화면에서도 마지막 요청만 결과를 반영하도록 요청 번호와 화면 생존 여부를 관리한다. */
export function createRequestGate() {
  let active = true;
  let epoch = 0;
  const lanes = new Map();
  return {
    activate() { active = true; },
    invalidate() { active = false; epoch += 1; lanes.clear(); },
    begin(lane = "default") {
      const version = (lanes.get(lane) || 0) + 1;
      lanes.set(lane, version);
      const startedEpoch = epoch;
      const startedActive = active;
      return () => startedActive && active && epoch === startedEpoch && lanes.get(lane) === version;
    },
  };
}
