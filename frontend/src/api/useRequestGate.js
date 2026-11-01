import { useLayoutEffect, useMemo } from "react";
import { createRequestGate } from "./requestGate.mjs";

/** 저금통·사용자가 바뀌거나 화면이 닫히면 이전 요청의 성공·오류·로딩 변경을 함께 무효화한다. */
export function useRequestGate(scope) {
  const gate = useMemo(() => createRequestGate(), [scope]);
  useLayoutEffect(() => {
    gate.activate();
    return () => gate.invalidate();
  }, [gate]);
  return gate;
}
