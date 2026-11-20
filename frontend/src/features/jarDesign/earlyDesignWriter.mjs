import { earlyDesignSnapshot, hasEarlyDesign } from "./earlyDesignDraftStore.mjs";

/** 연속된 틀 좌표·그림판 알림은 한 저장으로 합치고, 처리 중인 저장 뒤에는 최신 상태만 이어 쓴다. */
export function createEarlyDesignWriter({ initial, revision = 0, write, onStatus = () => {} }) {
  let state = earlyDesignSnapshot(initial), version = revision, pending = false, running = null, blocked = false, stopped = false;
  function drain() {
    if (running) return running;
    running = Promise.resolve().then(async () => {
      while (pending && !blocked && !stopped) {
        pending = false;
        const snapshot = state;
        version = await write(snapshot, version);
      }
      if (!blocked && !stopped) onStatus("saved", "");
    }).catch(error => {
      pending = false;
      if (error.code === "DRAFT_CONFLICT") blocked = true;
      onStatus("error", error.message || "작업을 저장하지 못했어요.");
      throw error;
    }).finally(() => {
      running = null;
      if (pending && !blocked && !stopped) return drain();
    });
    // 자동 저장 실패는 화면에서 알리고, flush/다시 시도는 같은 오류를 호출자에게도 돌려준다.
    void running.catch(() => {});
    return running;
  }
  return {
    patch(change) {
      if (blocked || stopped) return;
      state = earlyDesignSnapshot({ ...state, ...change });
      if (!hasEarlyDesign(state) && version === 0 && !running && !pending) return;
      pending = true; onStatus("saving", ""); void drain();
    },
    flush() { return running || (pending ? drain() : Promise.resolve()); },
    retry() {
      if (blocked || stopped) return Promise.reject(new Error("저장한 작업을 다시 열어주세요."));
      pending = hasEarlyDesign(state); return pending ? drain() : Promise.resolve();
    },
    async finish(serverDraftId) {
      await this.flush();
      if (blocked) throw new Error("저장한 작업을 다시 열어주세요.");
      stopped = true;
      version = await write(state, version, { remove: true, serverDraftId });
    },
    get snapshot() { return state; },
    get busy() { return Boolean(running || pending); },
  };
}
