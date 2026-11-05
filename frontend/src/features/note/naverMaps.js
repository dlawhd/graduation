// 지도 버튼을 누른 때만 SDK를 불러오며 작성창 여러 개도 하나의 로딩 요청을 공유한다.
let pending;
let sequence = 0;
let failed = false;

export function loadNaverMaps() {
  if (pending) return pending;
  if (!failed && window.naver?.maps?.Service?.reverseGeocode) return Promise.resolve(window.naver.maps);
  const key = import.meta.env.VITE_NAVER_MAP_KEY_ID?.trim();
  if (!key) return Promise.reject(new Error("MAP_NOT_CONFIGURED"));
  pending = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    const callback = `__memoryJarNaverReady${++sequence}`;
    const previousAuthFailure = window.navermap_authFailure;
    let settled = false;
    let timer;
    const cleanup = () => {
      clearTimeout(timer);
      delete window[callback];
      if (window.navermap_authFailure === authFailure) {
        if (previousAuthFailure) window.navermap_authFailure = previousAuthFailure;
        else delete window.navermap_authFailure;
      }
    };
    const fail = (message = "MAP_LOAD_FAILED") => {
      if (settled) return;
      settled = true; failed = true; cleanup(); script.remove(); pending = undefined;
      reject(new Error(message));
    };
    const authFailure = () => fail("MAP_AUTH_FAILED");
    window.navermap_authFailure = authFailure;
    window[callback] = () => {
      if (settled) return;
      if (!window.naver?.maps?.Service?.reverseGeocode) return fail();
      settled = true; failed = false; cleanup(); resolve(window.naver.maps);
    };
    timer = window.setTimeout(() => fail(), 12000);
    script.async = true;
    // ncpKeyId는 브라우저 공개용 식별자다. 지역 검색의 Client Secret은 절대로 여기에 넣지 않는다.
    script.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${encodeURIComponent(key)}&submodules=geocoder&callback=${callback}`;
    script.onerror = () => fail();
    document.head.append(script);
  });
  return pending;
}
