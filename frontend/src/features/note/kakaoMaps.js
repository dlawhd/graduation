// 지도 버튼을 누른 때만 SDK를 불러오고, 여러 작성창이 같은 로딩 요청을 공유한다.
let pending;
export function loadKakaoMaps() {
  if (window.kakao?.maps?.services) return Promise.resolve(window.kakao.maps);
  if (pending) return pending;
  const key = import.meta.env.VITE_KAKAO_MAP_APP_KEY?.trim();
  if (!key) return Promise.reject(new Error("MAP_NOT_CONFIGURED"));
  pending = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.async = true;
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(key)}&autoload=false&libraries=services`;
    const fail = () => { clearTimeout(timer); script.remove(); pending = undefined; reject(new Error("MAP_LOAD_FAILED")); };
    const timer = window.setTimeout(fail, 12000);
    script.onerror = fail;
    script.onload = () => {
      if (!window.kakao?.maps?.load) return fail();
      window.kakao.maps.load(() => {
        if (!window.kakao.maps.services) return fail();
        clearTimeout(timer); resolve(window.kakao.maps);
      });
    };
    document.head.append(script);
  });
  return pending;
}
