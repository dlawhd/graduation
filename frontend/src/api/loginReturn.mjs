const RETURN_KEY = "postLoginRedirect";
const RETURN_ORIGIN = "https://memoryjar.invalid";
const RETURN_PATH = /^\/(?:jars(?:\/(?:[1-9]\d*|new|design\/new))?|invite\/[A-Za-z0-9_-]+|(?:admin\/)?support\/inquiries(?:\/[1-9]\d*)?|support\/new)\/?$/;

/** 로그인 후에도 접근 권한을 검사하는 앱 내부 화면만 복귀 주소로 사용한다. */
export function loginReturnTarget(value) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")
      || /[\\\x00-\x20\x7f]/.test(value)) return null;
  const target = new URL(value, RETURN_ORIGIN);
  if (target.origin !== RETURN_ORIGIN || !RETURN_PATH.test(target.pathname)
      || target.pathname !== value.split(/[?#]/, 1)[0]) return null;
  return target.pathname + target.search + target.hash;
}

/** 소셜 로그인은 서비스 밖으로 이동하므로 돌아올 주소를 같은 탭에 잠시 보관한다. */
export function rememberLoginReturn(value) {
  try {
    const target = loginReturnTarget(value);
    if (target) window.sessionStorage.setItem(RETURN_KEY, target);
    else window.sessionStorage.removeItem(RETURN_KEY);
  } catch {
    // 저장소가 제한돼도 로그인 자체는 계속할 수 있다.
  }
}

export function readLoginReturn() {
  try { return loginReturnTarget(window.sessionStorage.getItem(RETURN_KEY)); }
  catch { return null; }
}
