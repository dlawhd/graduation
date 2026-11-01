/** 사진 요청의 수명을 관리한다. 같은 사진은 로딩 중에도 재사용하고, 배치 변경에는 최신 그리기 함수만 적용한다. */
export function createPhotoTextureLoader({ openSource, onError, createImage = () => new Image() }) {
  let current = null;
  let disposed = false;

  function clear() {
    const previous = current;
    current = null;
    if (!previous) return;
    previous.image.onload = previous.image.onerror = null;
    previous.controller.abort();
    previous.source?.dispose();
  }

  /** URL이 같으면 요청을 유지한다. 완료된 사진에만 다시 그리기를 실행한다. */
  function update(url, textureUrl, paint) {
    if (disposed) return;
    if (current && current.url === url && current.textureUrl === textureUrl) {
      current.paint = paint;
      if (current.ready) current.paint(current.image);
      return;
    }
    clear();
    if (!url) return;
    const image = createImage();
    image.crossOrigin = "anonymous";
    const load = { url, textureUrl, image, paint, ready: false, controller: new AbortController(), source: null };
    current = load;
    const active = () => !disposed && current === load;
    const fail = () => { if (active()) { clear(); onError(); } };
    image.onload = () => {
      if (!active()) return;
      if (!(image.naturalWidth > 0)) { fail(); return; }
      load.ready = true;
      load.paint(image);
    };
    image.onerror = fail;
    (async () => {
      try {
        const source = await openSource(url, textureUrl, load.controller.signal);
        // 화면을 바꾼 뒤 늦게 도착한 임시 사진 주소도 반드시 해제한다.
        if (!active()) { source.dispose(); return; }
        load.source = source;
        image.src = source.url;
      } catch { fail(); }
    })();
  }

  return {
    update,
    repaint() { if (!disposed && current?.ready) current.paint(current.image); },
    dispose() { if (!disposed) { disposed = true; clear(); } },
  };
}
