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
 * 3. NAVER / GOOGLE / KAKAO 중 원하는 로그인 방법을 선택할 수 있게 한다.
 * 4. 선택한 OAuth Provider의 로그인 화면으로 이동한다.
 * 5. 로그인 완료 후 원래 보고 있던 화면으로 돌아오게 한다.
 *
 * 중요한 점:
 *
 * Provider마다 별도의 로그인 함수를 만들지 않는다.
 *
 * handleLogin(provider) 하나를 사용해서
 *
 * NAVER
 * → /oauth2/authorization/naver
 *
 * GOOGLE
 * → /oauth2/authorization/google
 *
 * KAKAO
 * → /oauth2/authorization/kakao
 *
 * 형태로 기존 Spring Security OAuth2 구조를 그대로 재사용한다.
 */


/*
 * SessionExpiredPage에서 지원하는 로그인 방법이다.
 *
 * handleLogin()에 잘못된 Provider가 들어가는 것을 막기 위해
 * 한 곳에서 목록을 관리한다.
 */
const SUPPORTED_LOGIN_PROVIDERS = [
  "naver",
  "google",
  "kakao",
];


/*
 * NaverLogo 역할
 *
 * 네이버 로그인 버튼에서 사용할 간단한 N 로고다.
 *
 * 별도 이미지 요청 없이 바로 렌더링할 수 있도록
 * 텍스트 기반으로 표시한다.
 */
function NaverLogo() {
  return (
    <span
      aria-hidden="true"
      className="flex h-6 w-6 items-center justify-center text-lg font-black text-white"
    >
      N
    </span>
  );
}


/*
 * GoogleLogo 역할
 *
 * Google 로그인 버튼 왼쪽에 보여줄
 * 간단한 Google 색상 로고다.
 *
 * 외부 이미지 파일을 요청하지 않고
 * SVG 자체로 화면에 표시한다.
 */
function GoogleLogo() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-6 w-6"
      aria-hidden="true"
    >
      {/* Google G 로고를 구성하는 네 가지 색상 */}
      <path
        fill="#4285F4"
        d="M21.6 12.23c0-.71-.06-1.39-.18-2.04H12v3.86h5.38a4.6 4.6 0 0 1-1.99 3.02v2.51h3.22c1.89-1.74 2.99-4.31 2.99-7.35Z"
      />

      <path
        fill="#34A853"
        d="M12 22c2.7 0 4.97-.89 6.62-2.42l-3.22-2.51c-.89.6-2.03.96-3.4.96-2.61 0-4.82-1.76-5.61-4.13H3.06v2.59A10 10 0 0 0 12 22Z"
      />

      <path
        fill="#FBBC05"
        d="M6.39 13.9A6.02 6.02 0 0 1 6.08 12c0-.66.11-1.3.31-1.9V7.51H3.06A10 10 0 0 0 2 12c0 1.61.39 3.13 1.06 4.49l3.33-2.59Z"
      />

      <path
        fill="#EA4335"
        d="M12 5.97c1.47 0 2.79.51 3.83 1.5l2.87-2.88C16.96 2.97 14.7 2 12 2a10 10 0 0 0-8.94 5.51l3.33 2.59C7.18 7.73 9.39 5.97 12 5.97Z"
      />
    </svg>
  );
}


/*
 * KakaoLogo 역할
 *
 * 카카오 로그인 버튼 왼쪽에 보여줄
 * 카카오를 상징하는 말풍선 모양 아이콘이다.
 *
 * 외부 이미지 URL을 사용하지 않아서
 * 네트워크 요청 없이 바로 표시된다.
 */
function KakaoLogo() {
  return (
    <svg
      viewBox="0 0 32 32"
      className="h-6 w-6"
      aria-hidden="true"
    >
      {/* 카카오를 알아보기 쉬운 검은색 대화 말풍선 */}
      <path
        fill="currentColor"
        d="M16 5C9.37 5 4 9.14 4 14.25c0 3.3 2.25 6.2 5.64 7.84l-1.43 5.22c-.12.43.37.77.74.52l5.97-3.94c.35.03.71.04 1.08.04 6.63 0 12-4.14 12-9.68S22.63 5 16 5Z"
      />
    </svg>
  );
}


/*
 * SessionExpiredPage 컴포넌트
 *
 * 로그인 세션이 완전히 만료되었을 때
 * 다시 인증할 수 있는 화면을 보여준다.
 */
export default function SessionExpiredPage({
  title = "로그인이 만료됐어요",
  description = "추억을 안전하게 보호하기 위해 다시 로그인이 필요해요.",
}) {

  /*
   * 현재 사용자가 보고 있는 URL 정보를 가져온다.
   *
   * 로그인 성공 후 같은 화면으로 돌아오기 위해 사용한다.
   */
  const location = useLocation();


  /*
   * OAuth 로그인을 시작할 Spring Boot 백엔드 주소다.
   *
   * 예:
   * http://localhost:8080
   * https://api.esjh.shop
   */
  const backendUrl =
    import.meta.env.VITE_API_BASE_URL;


  /*
   * 현재 어떤 OAuth Provider로 이동 중인지 저장한다.
   *
   * null
   * → 이동 중 아님
   *
   * "naver"
   * → NAVER로 이동 중
   *
   * "google"
   * → GOOGLE로 이동 중
   *
   * "kakao"
   * → KAKAO로 이동 중
   *
   * 기존 boolean redirecting보다 Provider 이름을 직접 저장하면
   * 어떤 로그인 버튼을 눌렀는지도 정확히 표시할 수 있다.
   */
  const [
    redirectingProvider,
    setRedirectingProvider,
  ] = useState(null);


  // 환경변수나 Provider 값에 문제가 있을 때 사용자에게 보여줄 문구
  const [
    errorMessage,
    setErrorMessage,
  ] = useState("");


  /*
   * 다시 로그인 처리
   *
   * provider 예:
   *
   * naver
   * google
   * kakao
   *
   * 현재 페이지를 sessionStorage에 저장한 뒤
   * 선택한 Provider의 Spring Security OAuth 로그인 주소로 이동한다.
   */
  function handleLogin(provider) {

    /*
     * 예상하지 못한 Provider가 들어오면
     * 잘못된 OAuth 주소로 이동하지 않도록 막는다.
     */
    if (!SUPPORTED_LOGIN_PROVIDERS.includes(provider)) {
      setErrorMessage(
        "지원하지 않는 로그인 방법이에요."
      );

      return;
    }


    /*
     * 백엔드 주소가 없다면 OAuth 로그인을 시작할 수 없다.
     */
    if (!backendUrl) {
      setErrorMessage(
        "로그인 서버 주소를 확인하지 못했어요. 잠시 후 다시 시도해 주세요."
      );

      return;
    }


    /*
     * 사용자가 로그인 전에 보고 있던 정확한 주소를 만든다.
     *
     * pathname
     * → /jars/10
     *
     * search
     * → ?tab=members
     *
     * hash
     * → #comments
     *
     * 모두 합쳐서 로그인 후 최대한 같은 위치로 돌려보낸다.
     */
    const redirectTarget =
      `${location.pathname}` +
      `${location.search}` +
      `${location.hash}`;


    /*
     * LoginSuccess가 로그인 완료 후 꺼내 사용할 주소다.
     *
     * 예:
     *
     * /jars
     * /jars/10
     * /jars/10?tab=members
     */
    sessionStorage.setItem(
      "postLoginRedirect",
      redirectTarget
    );


    // 이전 오류 문구를 지운다.
    setErrorMessage("");


    /*
     * 어떤 Provider로 이동 중인지 저장해서
     * 버튼 중복 클릭을 막고 정확한 로딩 문구를 표시한다.
     */
    setRedirectingProvider(
      provider
    );


    /*
     * Spring Security OAuth2 로그인 시작 주소로 이동한다.
     *
     * NAVER:
     * /oauth2/authorization/naver
     *
     * GOOGLE:
     * /oauth2/authorization/google
     *
     * KAKAO:
     * /oauth2/authorization/kakao
     */
    window.location.href =
      `${backendUrl}` +
      `/oauth2/authorization/${provider}`;
  }


  /*
   * OAuth 화면으로 이동 중이면
   * 다른 로그인 버튼까지 잠가서 중복 클릭을 막는다.
   */
  const isRedirecting =
    Boolean(redirectingProvider);


  return (
    <div className="relative min-h-[calc(100vh-80px)] overflow-hidden bg-gradient-to-br from-emerald-50 via-white to-cyan-50 px-4 py-10 sm:px-6">

      {/* 배경 장식 */}
      <div className="pointer-events-none absolute -left-24 -top-24 h-80 w-80 rounded-full bg-emerald-200/40 blur-3xl" />

      <div className="pointer-events-none absolute -bottom-28 -right-20 h-96 w-96 rounded-full bg-violet-200/35 blur-3xl" />

      <div className="pointer-events-none absolute left-1/2 top-1/3 h-72 w-72 -translate-x-1/2 rounded-full bg-cyan-100/55 blur-3xl" />


      {/*
       * 로그인 첫 화면처럼
       * 내용이 너무 좌우로 퍼지지 않도록
       * 세션 만료 카드의 최대 너비를 조금 줄인다.
       */}
      <main className="relative z-10 mx-auto flex min-h-[calc(100vh-160px)] w-full max-w-2xl items-center justify-center">

        <section className="w-full rounded-[38px] border border-white/80 bg-white/80 px-6 py-9 text-center shadow-[0_28px_90px_rgba(15,23,42,0.12)] backdrop-blur-xl sm:px-12 sm:py-11">

          {/* ==================================================
              Memory Jar 브랜드 표시
             ================================================== */}
          <div className="inline-flex items-center gap-3 rounded-full border border-white bg-white/90 px-4 py-2 shadow-sm">
            <MemoryJarLogoIcon className="h-8 w-8" />

            <span className="text-sm font-black uppercase tracking-[0.24em] text-emerald-600">
              Memory Jar
            </span>
          </div>


          {/* ==================================================
              로그인 만료를 표현하는 Memory Jar 아이콘
             ================================================== */}
          <div className="relative mx-auto my-6 flex h-36 w-36 items-center justify-center sm:h-40 sm:w-40">

            <div className="absolute inset-4 rounded-full bg-gradient-to-br from-emerald-200/65 via-cyan-100/70 to-violet-100/70 blur-3xl" />

            <div className="relative rounded-full border border-white/90 bg-white/65 p-4 shadow-[0_20px_60px_rgba(15,23,42,0.12)]">
              <MemoryJarLogoIcon className="h-24 w-24 sm:h-28 sm:w-28" />
            </div>

            {/* 작은 자물쇠 표시 */}
            <div className="absolute bottom-2 right-1 flex h-10 w-10 items-center justify-center rounded-full border-4 border-white bg-slate-800 text-base text-white shadow-lg">
              🔒
            </div>
          </div>


          {/* ==================================================
              세션 만료 안내
             ================================================== */}
          <h1 className="text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">
            {title}
          </h1>

          <p className="mx-auto mt-4 max-w-xl break-keep text-sm font-medium leading-7 text-slate-500 sm:text-base">
            {description}
            <br />
            다시 로그인하면 방금 보고 있던 화면으로 돌아올 수 있어요.
          </p>


          {/* ==================================================
              오류 안내
             ================================================== */}
          {errorMessage && (
            <div
              role="alert"
              className="mx-auto mt-5 max-w-xl rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600"
            >
              {errorMessage}
            </div>
          )}


          {/* 첫 로그인 화면과 동일한 느낌의 소셜 로그인 안내 */}
          <p className="mt-7 text-[11px] font-bold text-slate-400">
            소셜 계정으로 다시 로그인
          </p>


          {/* ==================================================
              NAVER / GOOGLE / KAKAO 재로그인

              로그인 첫 화면과 디자인을 통일하기 위해
              큰 가로 버튼 대신 동그란 아이콘 버튼 3개를
              가로 한 줄로 보여준다.

              Provider 이름은 화면에 따로 쓰지 않고
              aria-label / title로 접근성은 유지한다.
             ================================================== */}
          <div className="mx-auto mt-4 flex items-center justify-center gap-6">

            {/* ==================================================
                NAVER
               ================================================== */}
            <button
              type="button"
              onClick={() => handleLogin("naver")}
              disabled={isRedirecting}
              aria-label="네이버로 다시 로그인"
              title="네이버로 다시 로그인"
              className="flex h-14 w-14 items-center justify-center rounded-full bg-[#03C75A] text-white shadow-md shadow-emerald-200/70 transition hover:-translate-y-1 hover:shadow-lg focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-200 disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-60"
            >
              {/*
               * 네이버 로그인으로 이동 중이면
               * N 대신 로딩 표시를 보여준다.
               */}
              {redirectingProvider === "naver" ? (
                <span className="h-6 w-6 animate-spin rounded-full border-[3px] border-white/35 border-t-white" />
              ) : (
                <NaverLogo />
              )}
            </button>


            {/* ==================================================
                GOOGLE
               ================================================== */}
            <button
              type="button"
              onClick={() => handleLogin("google")}
              disabled={isRedirecting}
              aria-label="Google로 다시 로그인"
              title="Google로 다시 로그인"
              className="flex h-14 w-14 items-center justify-center rounded-full border border-slate-200 bg-white shadow-md shadow-slate-200/70 transition hover:-translate-y-1 hover:border-slate-300 hover:shadow-lg focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-slate-200 disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-60"
            >
              {redirectingProvider === "google" ? (
                <span className="h-6 w-6 animate-spin rounded-full border-[3px] border-slate-200 border-t-blue-500" />
              ) : (
                <GoogleLogo />
              )}
            </button>


            {/* ==================================================
                KAKAO
               ================================================== */}
            <button
              type="button"
              onClick={() => handleLogin("kakao")}
              disabled={isRedirecting}
              aria-label="카카오로 다시 로그인"
              title="카카오로 다시 로그인"
              className="flex h-14 w-14 items-center justify-center rounded-full bg-[#FEE500] text-[#191919] shadow-md shadow-yellow-200/70 transition hover:-translate-y-1 hover:bg-[#f5dc00] hover:shadow-lg focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-yellow-200 disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-60"
            >
              {redirectingProvider === "kakao" ? (
                <span className="h-6 w-6 animate-spin rounded-full border-[3px] border-black/15 border-t-black/70" />
              ) : (
                <KakaoLogo />
              )}
            </button>

          </div>


          {/* ==================================================
              로그인하지 않고 첫 화면으로 돌아가기
             ================================================== */}
          <div className="mt-5">
            <Link
              to="/"
              className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-bold text-slate-600 transition hover:-translate-y-0.5 hover:bg-slate-50"
            >
              첫 화면으로
            </Link>
          </div>

        </section>
      </main>
    </div>
  );
}