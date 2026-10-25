/** 개발 진단 화면에서만 3D 전환의 구간별 시간을 모은다. URL·사진·사용자 정보는 기록하지 않는다. */
export function createBody3DTiming({ enabled = false, now = () => performance.now() } = {}) {
  if (!enabled) return null;
  const origin = now(), marks = {}, spans = [];
  let closed = false;
  const elapsed = () => Math.max(0, now() - origin);
  return {
    /** 같은 완료 지점을 중복 기록하지 않아 회전 조작이 최초 전환 시간을 덮어쓰지 않는다. */
    mark(name) {
      if (!closed && marks[name] === undefined) marks[name] = elapsed();
    },
    /** 비동기 대기와 동기 계산을 같은 시계로 기록한다. 겹치는 구간은 합산하면 안 된다. */
    start(name) {
      const startMs = elapsed();
      let ended = false;
      return () => {
        if (ended || closed) return;
        ended = true;
        const endMs = elapsed();
        spans.push({ name, startMs, endMs, durationMs: endMs - startMs });
      };
    },
    measure(name, task) {
      const end = this.start(name);
      try { return task(); } finally { end(); }
    },
    /** 모든 텍스처를 사용한 render 호출이 끝난 시점이다. GPU 완료나 물리적 화면 출력을 뜻하지 않는다. */
    finish() {
      if (closed) return null;
      this.mark("texturedRenderEnd");
      closed = true;
      return { version: 1, status: "complete", marks: { ...marks }, spans: spans.map(span => ({ ...span })) };
    },
    cancel() { closed = true; },
  };
}
