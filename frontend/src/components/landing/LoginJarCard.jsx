import { useState } from "react";
import { Link } from "react-router-dom";
/*
 * LoginJarCard 역할
 *
 * 로그인 전 첫 화면 오른쪽에서
 * Memory Jar 자체 로그인 UI와
 * NAVER / GOOGLE / KAKAO 소셜 로그인을 보여주는
 * 저금통 모양의 로그인 컴포넌트야.
 *
 * 중요한 점:
 *
 * 저금통 바깥 모양은 처음 사용하던 비율을 그대로 유지한다.
 *
 * - 바깥 영역 높이: 550px
 * - 몸통 높이: 460px
 * - 몸통 너비: 390px
 * - 전체 확대 비율: 1.115
 *
 * 로그인 기능 중 Memory Jar 자체 로그인은
 * 아직 프론트 UI만 만드는 단계라서
 * 실제 백엔드 인증 요청은 보내지 않는다.
 *
 * 소셜 로그인은 기존 동작을 그대로 유지한다.
 */

/*
 * GoogleLogo 역할
 *
 * Google 소셜 로그인 버튼 안에 보여줄
 * 작은 Google 로고다.
 *
 * 외부 이미지 파일을 사용하지 않고
 * SVG로 직접 그려서 바로 표시한다.
 */
function GoogleLogo() {
  return (
    <svg
      viewBox="0 0 48 48"
      className="h-5 w-5"
      aria-hidden="true"
    >
      {/* Google 로고 파란색 */}
      <path
        fill="#4285F4"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z"
      />

      {/* Google 로고 빨간색 */}
      <path
        fill="#EA4335"
        d="M2.56 13.22 10.54 19.41C12.43 13.72 17.74 9.5 24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22Z"
      />

      {/* Google 로고 노란색 */}
      <path
        fill="#FBBC05"
        d="M24 48c6.24 0 11.48-2.05 15.31-5.57l-7.36-5.7c-2.04 1.37-4.64 2.18-7.95 2.18-6.04 0-11.16-4.08-12.99-9.56l-8.03 6.19C6.89 43.28 14.85 48 24 48Z"
      />

      {/* Google 로고 초록색 */}
      <path
        fill="#34A853"
        d="M11.01 29.35A14.46 14.46 0 0 1 10.25 24c0-1.86.32-3.67.89-5.35l-8.03-6.19A23.96 23.96 0 0 0 0 24c0 3.87.93 7.53 2.98 10.54l8.03-6.19Z"
      />

      {/* Google G 가운데 파란색 */}
      <path
        fill="#4285F4"
        d="M47.5 24.55c0-1.57-.14-3.08-.4-4.55H24v9.02h13.2c-.57 2.9-2.27 5.36-4.84 7.01l7.36 5.7C44.02 37.77 47.5 31.93 47.5 24.55Z"
      />
    </svg>
  );
}

/*
 * KakaoLogo 역할
 *
 * 카카오 로그인 버튼 안에 보여줄
 * 말풍선 모양 아이콘이다.
 */
function KakaoLogo() {
  return (
    <svg
      viewBox="0 0 32 32"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <path
        fill="currentColor"
        d="M16 5C9.37 5 4 9.14 4 14.25c0 3.3 2.25 6.2 5.64 7.84l-1.43 5.22c-.12.43.37.77.74.52l5.97-3.94c.35.03.71.04 1.08.04 6.63 0 12-4.14 12-9.68S22.63 5 16 5Z"
      />
    </svg>
  );
}

export default function LoginJarCard({
  checkingSession,
  redirectingProvider,
  errorMessage,
  onNaverLogin,
  onGoogleLogin,
  onKakaoLogin,
}) {
  /*
   * Memory Jar 자체 로그인 폼에 입력한 값을 저장한다.
   *
   * 현재는 프론트 UI 단계이기 때문에
   * 실제 백엔드 로그인 요청에는 사용하지 않는다.
   */
  const [loginId, setLoginId] =
    useState("");

  const [password, setPassword] =
    useState("");

  /*
   * 자체 로그인 관련 버튼을 눌렀을 때
   * 임시 안내 문구를 보여주기 위한 상태다.
   */
  const [
    localGuideMessage,
    setLocalGuideMessage,
  ] = useState("");

  /*
   * 세션을 확인 중이거나
   * 소셜 OAuth 화면으로 이동 중이면
   * 다른 로그인 버튼을 또 누르지 못하게 막는다.
   */
  const isBusy =
    checkingSession ||
    Boolean(redirectingProvider);

  /*
   * 현재 어느 OAuth Provider로
   * 이동하고 있는지 확인한다.
   */
  const isNaverRedirecting =
    redirectingProvider === "naver";

  const isGoogleRedirecting =
    redirectingProvider === "google";

  const isKakaoRedirecting =
    redirectingProvider === "kakao";

  /*
   * 소셜 로그인 상태 안내 문구
   */
  const helperMessage =
    errorMessage
      ? errorMessage
      : checkingSession
        ? "로그인 정보를 확인하고 있어요."
        : isNaverRedirecting
          ? "네이버 인증 화면으로 이동하고 있어요."
          : isGoogleRedirecting
            ? "Google 인증 화면으로 이동하고 있어요."
            : isKakaoRedirecting
              ? "카카오 인증 화면으로 이동하고 있어요."
              : "";

  /*
   * Memory Jar 자체 로그인 버튼 처리
   *
   * 지금은 프론트 UI 단계라서
   * 입력값 존재 여부만 확인한다.
   */
  function handleLocalLoginSubmit(event) {
    event.preventDefault();

    /*
     * 아이디 또는 비밀번호가 비어 있으면
     * 사용자에게 먼저 입력해 달라고 알려준다.
     */
    if (
      !loginId.trim() ||
      !password.trim()
    ) {
      setLocalGuideMessage(
        "아이디와 비밀번호를 입력해 주세요."
      );

      return;
    }

    /*
     * 아직 백엔드 로그인 API를 만들지 않았으므로
     * 실제 인증 요청 대신 안내 문구만 보여준다.
     */
    setLocalGuideMessage(
      "Memory Jar 로그인 기능은 다음 단계에서 연결할게요."
    );
  }

  /*
   * 아이디 찾기 / 비밀번호 찾기 임시 처리
   *
   * 회원가입 페이지는 이미 /signup으로 연결됐지만,
   * 아이디 찾기와 비밀번호 찾기는 아직 별도 페이지를
   * 만들지 않았기 때문에 안내 문구만 보여준다.
   */
  function handleUtilityClick(actionName) {
    setLocalGuideMessage(
      `${actionName} 기능은 다음 단계에서 연결할게요.`
    );
  }

  return (
    /*
     * ==================================================
     * 저금통 전체 영역
     *
     * 처음 사용하던 비율을 그대로 유지한다.
     * ==================================================
     */
    <div className="relative mx-auto h-[550px] w-full max-w-[450px] lg:translate-x-11">

      {/* 저금통 뒤쪽의 은은한 빛 */}
      <div className="pointer-events-none absolute left-1/2 top-20 h-80 w-80 -translate-x-1/2 rounded-full bg-cyan-100/55 blur-3xl" />

      <div className="pointer-events-none absolute bottom-6 right-2 h-44 w-44 rounded-full bg-violet-100/40 blur-3xl" />

      {/*
       * 저금통의 가로/세로 비율은 건드리지 않고
       * 전체 크기만 처음처럼 확대한다.
       */}
      <div
        className="absolute inset-0"
        style={{
          transform: "scale(1.115)",
          transformOrigin: "top center",
        }}
      >

        {/* ==================================================
            저금통 뚜껑
           ================================================== */}
        <div
          className="pointer-events-none absolute left-1/2 top-[26px] z-30 h-[58px] w-[260px] -translate-x-1/2 rounded-full p-[3px] shadow-[0_12px_28px_rgba(148,163,184,0.16)]"
          style={{
            background:
              "linear-gradient(110deg, rgba(125,211,252,0.72) 0%, rgba(196,181,253,0.58) 24%, rgba(251,207,232,0.48) 43%, rgba(254,240,138,0.42) 61%, rgba(167,243,208,0.54) 79%, rgba(125,211,252,0.68) 100%)",
          }}
        >
          {/* 실제 유리 뚜껑 */}
          <div className="relative h-full w-full overflow-hidden rounded-full border border-white/70 bg-white/72 backdrop-blur-[3px]">

            {/* 쪽지를 넣는 투입구 */}
            <div className="absolute left-1/2 top-[16px] h-2.5 w-[100px] -translate-x-1/2 rounded-full bg-slate-400/45 shadow-inner" />

            {/* 위쪽 반사광 */}
            <div className="absolute left-8 top-1.5 h-2.5 w-24 rounded-full bg-white/75 blur-[2px]" />

            {/* 아래쪽 민트빛 */}
            <div className="absolute bottom-0 left-1/2 h-3 w-[72%] -translate-x-1/2 rounded-full bg-emerald-100/25 blur-md" />
          </div>
        </div>

        {/* ==================================================
            저금통 몸통 바깥 테두리

            처음 비율:
            높이 460px
            너비 390px
           ================================================== */}
        <div
          className="absolute left-1/2 top-[62px] z-10 h-[460px] w-[390px] max-w-[92%] -translate-x-1/2 rounded-[42%_42%_28%_28%] p-[4px] shadow-[0_24px_70px_rgba(15,23,42,0.12)]"
          style={{
            background:
              "linear-gradient(135deg, rgba(125,211,252,0.88) 0%, rgba(196,181,253,0.65) 22%, rgba(251,207,232,0.52) 40%, rgba(254,240,138,0.48) 57%, rgba(167,243,208,0.60) 75%, rgba(125,211,252,0.84) 100%)",
          }}
        >
          {/* 실제 무색 유리 몸통 */}
          <div className="relative h-full w-full overflow-hidden rounded-[42%_42%_28%_28%] bg-white/80 backdrop-blur-[2px]">

            {/* 몸통 내부의 은은한 색 */}
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/80 via-white/55 to-emerald-50/45" />

            {/* 왼쪽 반사광 */}
            <div className="pointer-events-none absolute left-6 top-14 h-56 w-5 rounded-full bg-white/75 blur-[3px]" />

            {/* 오른쪽 반사광 */}
            <div className="pointer-events-none absolute right-7 top-20 h-32 w-3 rounded-full bg-cyan-50/80 blur-[2px]" />

            {/* 왼쪽 무지개 반사 */}
            <div
              className="pointer-events-none absolute -left-3 top-28 h-52 w-8 rounded-full opacity-35 blur-md"
              style={{
                background:
                  "linear-gradient(to bottom, #bae6fd, #ddd6fe, #fbcfe8, #fef3c7, #bbf7d0)",
              }}
            />

            {/* 오른쪽 무지개 반사 */}
            <div
              className="pointer-events-none absolute -right-3 bottom-24 h-44 w-8 rounded-full opacity-30 blur-md"
              style={{
                background:
                  "linear-gradient(to bottom, #bbf7d0, #bae6fd, #ddd6fe, #fbcfe8)",
              }}
            />

            {/* 반짝이 장식 */}
            <div className="pointer-events-none absolute right-7 top-24 text-2xl font-light text-cyan-300/75">
              ＋
            </div>

            <div className="pointer-events-none absolute bottom-32 left-5 text-xl font-light text-violet-300/55">
              ＋
            </div>

            {/* ==================================================
                실제 로그인 콘텐츠
               ================================================== */}
            <div className="relative z-10 flex h-full flex-col px-8 pb-6 pt-10 sm:px-10">

              {/* ==================================================
                  작은 Memory Jar 브랜드 배지만 유지

                  큰 로그인 제목은 제거한다.
                 ================================================== */}
              <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-emerald-100 bg-white/90 px-3.5 py-2 text-[11px] font-black uppercase tracking-[0.2em] text-emerald-600 shadow-sm">

                <span className="h-2 w-2 rounded-full bg-emerald-400" />

                Memory Jar
              </div>

              {/* ==================================================
                  자체 로그인 폼

                  별도 제목이나 아이콘 없이
                  아이디 입력부터 바로 보여준다.
                 ================================================== */}
              <div className="mx-auto mt-4 w-[84%] max-w-[300px] rounded-[26px] border border-white/85 bg-white/88 px-4 py-4 shadow-lg shadow-slate-200/55 backdrop-blur-sm">

                <form
                  onSubmit={handleLocalLoginSubmit}
                >
                  <div className="space-y-2.5">

                    {/* 아이디 */}
                    <div>
                      <label
                        htmlFor="memoryjar-login-id"
                        className="mb-1 block text-[11px] font-bold text-slate-500"
                      >
                        아이디
                      </label>

                      <input
                        id="memoryjar-login-id"
                        type="text"
                        value={loginId}
                        onChange={(event) =>
                          setLoginId(
                            event.target.value
                          )
                        }
                        disabled={isBusy}
                        autoComplete="username"
                        placeholder="아이디를 입력해 주세요"
                        className="h-10 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 outline-none transition placeholder:text-slate-300 focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-slate-50"
                      />
                    </div>

                    {/* 비밀번호 */}
                    <div>
                      <label
                        htmlFor="memoryjar-login-password"
                        className="mb-1 block text-[11px] font-bold text-slate-500"
                      >
                        비밀번호
                      </label>

                      <input
                        id="memoryjar-login-password"
                        type="password"
                        value={password}
                        onChange={(event) =>
                          setPassword(
                            event.target.value
                          )
                        }
                        disabled={isBusy}
                        autoComplete="current-password"
                        placeholder="비밀번호를 입력해 주세요"
                        className="h-10 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 outline-none transition placeholder:text-slate-300 focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-slate-50"
                      />
                    </div>
                  </div>

                  {/* ==================================================
                      자체 로그인 버튼

                      현재는 프론트 UI만 동작한다.
                     ================================================== */}
                  <button
                    type="submit"
                    disabled={isBusy}
                    className="mt-3 h-10 w-full rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-400 text-sm font-black text-white shadow-md shadow-emerald-200/70 transition hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-200 disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-70"
                  >
                    Memory Jar 로그인
                  </button>
                </form>

                {/* ==================================================
                    아이디 찾기 / 비밀번호 찾기 / 회원가입
                   ================================================== */}
                <div className="mt-2.5 flex items-center justify-center gap-1.5 whitespace-nowrap text-[10px] font-semibold text-slate-400">

                  <button
                    type="button"
                    onClick={() =>
                      handleUtilityClick(
                        "아이디 찾기"
                      )
                    }
                    className="transition hover:text-emerald-600"
                  >
                    아이디 찾기
                  </button>

                  <span className="text-slate-300">
                    |
                  </span>

                  <button
                    type="button"
                    onClick={() =>
                      handleUtilityClick(
                        "비밀번호 찾기"
                      )
                    }
                    className="transition hover:text-emerald-600"
                  >
                    비밀번호 찾기
                  </button>

                  <span className="text-slate-300">
                    |
                  </span>

                  {/*
                   * 회원가입
                   *
                   * 이제 실제 회원가입 페이지가 있으므로
                   * 임시 안내 문구를 띄우지 않고
                   * /signup 페이지로 바로 이동한다.
                   */}
                  <Link
                    to="/signup"
                    className="transition hover:text-emerald-600"
                  >
                    회원가입
                  </Link>
                </div>

                {/* 자체 로그인 임시 안내 */}
                {localGuideMessage && (
                  <p
                    role="status"
                    aria-live="polite"
                    className="mt-2 rounded-xl bg-emerald-50 px-2.5 py-1.5 text-center text-[10px] font-semibold leading-4 text-emerald-700"
                  >
                    {localGuideMessage}
                  </p>
                )}
              </div>

              {/* ==================================================
                  소셜 로그인 안내
                 ================================================== */}
              <p className="mt-3 text-center text-[10px] font-bold text-slate-400">
                소셜 계정으로 간편하게 로그인
              </p>

              {/* ==================================================
                  소셜 로그인 버튼

                  아이콘 아래 Provider 이름은 표시하지 않는다.

                  화면에는 동그란 아이콘 3개만
                  가로 한 줄로 보여준다.
                 ================================================== */}
              <div className="mx-auto mt-2.5 flex items-center justify-center gap-5">

                {/* NAVER */}
                <button
                  type="button"
                  onClick={onNaverLogin}
                  disabled={isBusy}
                  aria-label="네이버 로그인"
                  title="네이버 로그인"
                  className="flex h-12 w-12 items-center justify-center rounded-full bg-[#03C75A] text-white shadow-md shadow-emerald-200/70 transition hover:-translate-y-1 hover:shadow-lg focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-200 disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-60"
                >
                  {checkingSession ||
                  isNaverRedirecting ? (
                    <span className="h-5 w-5 animate-spin rounded-full border-[3px] border-white/35 border-t-white" />
                  ) : (
                    <span className="text-base font-black">
                      N
                    </span>
                  )}
                </button>

                {/* GOOGLE */}
                <button
                  type="button"
                  onClick={onGoogleLogin}
                  disabled={isBusy}
                  aria-label="Google 로그인"
                  title="Google 로그인"
                  className="flex h-12 w-12 items-center justify-center rounded-full border border-slate-200 bg-white shadow-md shadow-slate-200/65 transition hover:-translate-y-1 hover:border-slate-300 hover:shadow-lg focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-slate-200 disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-60"
                >
                  {checkingSession ||
                  isGoogleRedirecting ? (
                    <span className="h-5 w-5 animate-spin rounded-full border-[3px] border-slate-200 border-t-blue-500" />
                  ) : (
                    <GoogleLogo />
                  )}
                </button>

                {/* KAKAO */}
                <button
                  type="button"
                  onClick={onKakaoLogin}
                  disabled={isBusy}
                  aria-label="카카오 로그인"
                  title="카카오 로그인"
                  className="flex h-12 w-12 items-center justify-center rounded-full bg-[#FEE500] text-[#191919] shadow-md shadow-yellow-200/70 transition hover:-translate-y-1 hover:bg-[#f5dc00] hover:shadow-lg focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-yellow-200 disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-60"
                >
                  {checkingSession ||
                  isKakaoRedirecting ? (
                    <span className="h-5 w-5 animate-spin rounded-full border-[3px] border-black/15 border-t-black/70" />
                  ) : (
                    <KakaoLogo />
                  )}
                </button>
              </div>

              {/* ==================================================
                  소셜 로그인 상태 / 오류
                 ================================================== */}
              {(isBusy || errorMessage) && (
                <p
                  role={
                    errorMessage
                      ? "alert"
                      : undefined
                  }
                  aria-live="polite"
                  className={[
                    "mt-2 text-center text-[10px] leading-4",
                    errorMessage
                      ? "font-semibold text-rose-600"
                      : "text-slate-400",
                  ].join(" ")}
                >
                  {helperMessage}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 저금통 전체 확대 영역 끝 */}
    </div>
  );
}