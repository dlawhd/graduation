// src/components/auth/SessionExpiredPage.jsx

import {
  useState,
} from "react";
import {
  Link,
  useLocation,
} from "react-router-dom";
import MemoryJarLogoIcon from "../icons/MemoryJarLogoIcon";

/*
 * SessionExpiredPage 역할
 *
 * Access Token과 Refresh Token이 모두 만료되어
 * 다시 로그인이 필요한 사용자에게 보여주는 공통 화면이다.
 *
 * 주요 기능:
 *
 * 1. 서버의 기술적인 오류 문구를 숨긴다.
 * 2. 사용자가 보고 있던 현재 주소를 저장한다.
 * 3. 네이버 로그인을 시작한다.
 * 4. 로그인 완료 후 원래 화면으로 돌아오게 한다.
 */
export default function SessionExpiredPage({
  title = "로그인이 만료됐어요",
  description = "추억을 안전하게 보호하기 위해 다시 로그인이 필요해요.",
}) {
  const location = useLocation();

  // 네이버 로그인을 시작할 백엔드 주소
  const backendUrl =
    import.meta.env.VITE_API_BASE_URL;

  // 로그인 화면으로 이동 중인지
  const [
    redirecting,
    setRedirecting,
  ] = useState(false);

  // 환경변수 등이 잘못됐을 때 보여줄 문구
  const [
    errorMessage,
    setErrorMessage,
  ] = useState("");

  /*
   * 다시 로그인 버튼 처리
   *
   * 현재 주소를 sessionStorage에 저장한 뒤
   * 네이버 OAuth 로그인 화면으로 이동한다.
   */
  function handleLogin() {
    if (!backendUrl) {
      setErrorMessage(
        "로그인 서버 주소를 확인하지 못했어요. 잠시 후 다시 시도해 주세요."
      );

      return;
    }

    const redirectTarget =
      `${location.pathname}` +
      `${location.search}` +
      `${location.hash}`;

    /*
     * LoginSuccess가 로그인 완료 후 꺼내 사용할 주소다.
     *
     * 예:
     * /jars
     * /jars/10
     */
    sessionStorage.setItem(
      "postLoginRedirect",
      redirectTarget
    );

    setErrorMessage("");
    setRedirecting(true);

    window.location.href =
      `${backendUrl}` +
      "/oauth2/authorization/naver";
  }

  return (
    <div className="relative min-h-[calc(100vh-80px)] overflow-hidden bg-gradient-to-br from-emerald-50 via-white to-cyan-50 px-4 py-10 sm:px-6">
      {/* 배경 장식 */}
      <div className="pointer-events-none absolute -left-24 -top-24 h-80 w-80 rounded-full bg-emerald-200/40 blur-3xl" />

      <div className="pointer-events-none absolute -bottom-28 -right-20 h-96 w-96 rounded-full bg-violet-200/35 blur-3xl" />

      <div className="pointer-events-none absolute left-1/2 top-1/3 h-72 w-72 -translate-x-1/2 rounded-full bg-cyan-100/55 blur-3xl" />

      <main className="relative z-10 mx-auto flex min-h-[calc(100vh-160px)] w-full max-w-3xl items-center justify-center">
        <section className="w-full rounded-[38px] border border-white/80 bg-white/80 px-6 py-9 text-center shadow-[0_28px_90px_rgba(15,23,42,0.12)] backdrop-blur-xl sm:px-12 sm:py-11">
          {/* 브랜드 표시 */}
          <div className="inline-flex items-center gap-3 rounded-full border border-white bg-white/90 px-4 py-2 shadow-sm">
            <MemoryJarLogoIcon className="h-8 w-8" />

            <span className="text-sm font-black uppercase tracking-[0.24em] text-emerald-600">
              Memory Jar
            </span>
          </div>

          {/* 로그인 만료를 표현하는 저금통 */}
          <div className="relative mx-auto my-7 flex h-44 w-44 items-center justify-center sm:h-52 sm:w-52">
            <div className="absolute inset-4 rounded-full bg-gradient-to-br from-emerald-200/65 via-cyan-100/70 to-violet-100/70 blur-3xl" />

            <div className="relative rounded-full border border-white/90 bg-white/65 p-4 shadow-[0_20px_60px_rgba(15,23,42,0.12)]">
              <MemoryJarLogoIcon className="h-28 w-28 sm:h-32 sm:w-32" />
            </div>

            {/* 작은 자물쇠 표시 */}
            <div className="absolute bottom-4 right-3 flex h-11 w-11 items-center justify-center rounded-full border-4 border-white bg-slate-800 text-lg text-white shadow-lg">
              🔒
            </div>
          </div>

          <h1 className="text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">
            {title}
          </h1>

          <p className="mx-auto mt-4 max-w-xl break-keep text-sm font-medium leading-7 text-slate-500 sm:text-base">
            {description}
            <br />
            다시 로그인하면 방금 보고 있던 화면으로 돌아올 수 있어요.
          </p>

          {errorMessage && (
            <div
              role="alert"
              className="mx-auto mt-5 max-w-xl rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600"
            >
              {errorMessage}
            </div>
          )}

          <div className="mt-8 flex flex-col-reverse items-stretch justify-center gap-3 sm:flex-row sm:items-center">
            <Link
              to="/"
              className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-bold text-slate-600 transition hover:-translate-y-0.5 hover:bg-slate-50"
            >
              첫 화면으로
            </Link>

            <button
              type="button"
              onClick={handleLogin}
              disabled={redirecting}
              className="inline-flex min-w-[180px] items-center justify-center rounded-2xl bg-[#03C75A] px-5 py-3 text-sm font-black text-white shadow-[0_12px_28px_rgba(3,199,90,0.25)] transition hover:-translate-y-0.5 hover:bg-[#02b351] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {redirecting
                ? "로그인 화면으로 이동 중..."
                : "네이버로 다시 로그인"}
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}