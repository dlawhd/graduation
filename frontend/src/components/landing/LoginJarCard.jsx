/*
 * LoginJarCard 역할
 *
 * 로그인 전 첫 화면 오른쪽에서
 * 네이버 또는 Google 로그인을 시작하는 저금통 컴포넌트야.
 *
 * 기존 프로젝트의 JarVisual과 같은 저금통 비율과 둥근 모양을 사용해.
 * 별도의 SVG 병을 강제로 늘리지 않기 때문에 화면 크기가 달라져도
 * 저금통이 길쭉하게 찌그러지지 않아.
 *
 * 구성:
 * 1. 무색 반투명 저금통 뚜껑
 * 2. 무색 반투명 유리 몸통
 * 3. 햇빛을 받은 듯한 옅은 무지개 테두리
 * 4. 네이버 로그인 버튼
 * 5. Google 로그인 버튼
 * 6. Memory Jar 전용 계정 준비 중 안내
 */

/*
 * GoogleLogo 역할
 *
 * Google 로그인 버튼에 보여줄 작은 Google 로고다.
 *
 * 외부 이미지 주소를 사용하지 않고 컴포넌트 안에서 SVG로 그리기 때문에
 * 별도 이미지 파일을 추가하지 않아도 되고 네트워크 상태에도 영향을 받지 않는다.
 */
function GoogleLogo() {
  return (
    <svg
      viewBox="0 0 48 48"
      className="h-6 w-6"
      aria-hidden="true"
    >
      {/* Google 로고의 파란색 부분 */}
      <path
        fill="#4285F4"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z"
      />

      {/* Google 로고의 빨간색 부분 */}
      <path
        fill="#EA4335"
        d="M2.56 13.22 10.54 19.41C12.43 13.72 17.74 9.5 24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22Z"
      />

      {/* Google 로고의 노란색 부분 */}
      <path
        fill="#FBBC05"
        d="M24 48c6.24 0 11.48-2.05 15.31-5.57l-7.36-5.7c-2.04 1.37-4.64 2.18-7.95 2.18-6.04 0-11.16-4.08-12.99-9.56l-8.03 6.19C6.89 43.28 14.85 48 24 48Z"
      />

      {/* Google 로고의 초록색 부분 */}
      <path
        fill="#34A853"
        d="M11.01 29.35A14.46 14.46 0 0 1 10.25 24c0-1.86.32-3.67.89-5.35l-8.03-6.19A23.96 23.96 0 0 0 0 24c0 3.87.93 7.53 2.98 10.54l8.03-6.19Z"
      />

      {/* 가운데 Google G 모양을 만드는 파란색 부분 */}
      <path
        fill="#4285F4"
        d="M47.5 24.55c0-1.57-.14-3.08-.4-4.55H24v9.02h13.2c-.57 2.9-2.27 5.36-4.84 7.01l7.36 5.7C44.02 37.77 47.5 31.93 47.5 24.55Z"
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
}) {
  /*
   * 로그인 상태를 확인 중이거나
   * 네이버 / Google 인증 화면으로 이동 중이면
   * 중복 클릭을 막기 위해 두 로그인 버튼을 모두 잠근다.
   */
  const isBusy =
    checkingSession || Boolean(redirectingProvider);

  /*
   * 어떤 Provider로 이동 중인지 구분한다.
   *
   * 이렇게 나누면 Google을 눌렀을 때
   * 잘못 "네이버로 이동 중"이라고 표시되는 문제를 막을 수 있다.
   */
  const isNaverRedirecting =
    redirectingProvider === "naver";

  const isGoogleRedirecting =
    redirectingProvider === "google";

  /*
   * 로그인 버튼 아래에 현재 상태를 알려주는 문구다.
   */
  const helperMessage = errorMessage
    ? errorMessage
    : checkingSession
      ? "로그인 정보를 확인하고 있어요."
      : isNaverRedirecting
        ? "안전한 네이버 인증 화면으로 이동하고 있어요."
        : isGoogleRedirecting
          ? "안전한 Google 인증 화면으로 이동하고 있어요."
          : "";

  return (
    <div className="relative mx-auto h-[550px] w-full max-w-[450px] lg:translate-x-11">
      {/* 저금통 뒤쪽에 퍼지는 은은한 빛 */}
      <div className="pointer-events-none absolute left-1/2 top-20 h-80 w-80 -translate-x-1/2 rounded-full bg-cyan-100/55 blur-3xl" />

      <div className="pointer-events-none absolute bottom-6 right-2 h-44 w-44 rounded-full bg-violet-100/40 blur-3xl" />

      {/*
       * 저금통의 가로·세로 비율을 유지하면서 전체를 확대한다.
       * 확대 기준은 위쪽 가운데라서 아래쪽으로 자연스럽게 커진다.
       */}
      <div
        className="absolute inset-0"
        style={{
          transform: "scale(1.115)",
          transformOrigin: "top center",
        }}
      >
        {/* ==================================================
            무색 유리 저금통 뚜껑
           ================================================== */}
        <div
          className="pointer-events-none absolute left-1/2 top-[26px] z-30 h-[58px] w-[260px] -translate-x-1/2 rounded-full p-[3px] shadow-[0_12px_28px_rgba(148,163,184,0.16)]"
          style={{
            background:
              "linear-gradient(110deg, rgba(125,211,252,0.72) 0%, rgba(196,181,253,0.58) 24%, rgba(251,207,232,0.48) 43%, rgba(254,240,138,0.42) 61%, rgba(167,243,208,0.54) 79%, rgba(125,211,252,0.68) 100%)",
          }}
        >
          {/* 실제 무색 유리 뚜껑 안쪽 */}
          <div className="relative h-full w-full overflow-hidden rounded-full border border-white/70 bg-white/72 backdrop-blur-[3px]">
            {/* 쪽지를 넣는 투입구 */}
            <div className="absolute left-1/2 top-[16px] h-2.5 w-[100px] -translate-x-1/2 rounded-full bg-slate-400/45 shadow-inner" />

            {/* 뚜껑 윗부분 반사광 */}
            <div className="absolute left-8 top-1.5 h-2.5 w-24 rounded-full bg-white/75 blur-[2px]" />

            {/* 뚜껑 아래쪽의 옅은 민트빛 */}
            <div className="absolute bottom-0 left-1/2 h-3 w-[72%] -translate-x-1/2 rounded-full bg-emerald-100/25 blur-md" />
          </div>
        </div>

        {/* ==================================================
            무색 유리 저금통 몸통 바깥 테두리
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
            {/* 몸통 안쪽의 은은한 색감 */}
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/80 via-white/55 to-emerald-50/45" />

            {/* 왼쪽 유리 반사광 */}
            <div className="pointer-events-none absolute left-6 top-14 h-56 w-5 rounded-full bg-white/75 blur-[3px]" />

            {/* 오른쪽 유리 반사광 */}
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

            {/* 작은 반짝이 장식 */}
            <div className="pointer-events-none absolute right-7 top-24 text-2xl font-light text-cyan-300/75">
              ＋
            </div>

            <div className="pointer-events-none absolute bottom-32 left-5 text-xl font-light text-violet-300/55">
              ＋
            </div>

            {/* ==================================================
                실제 로그인 콘텐츠
               ================================================== */}
            <div className="relative z-10 flex h-full flex-col px-8 pb-7 pt-12 sm:px-10">
              {/* Memory Jar 서비스 배지 */}
              <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-emerald-100 bg-white/90 px-3.5 py-2 text-[11px] font-black uppercase tracking-[0.2em] text-emerald-600 shadow-sm">
                <span className="h-2 w-2 rounded-full bg-emerald-400" />

                Memory Jar
              </div>

              {/* 로그인 제목 */}
              <h2 className="mt-4 text-center text-[2rem] font-black leading-tight text-slate-900">
                저금통 입장하기
              </h2>

              {/* 로그인 설명 */}
              <p className="mt-2 text-center text-sm leading-6 text-slate-500">
                원하는 방법으로 Memory Jar를 시작해보세요.
              </p>

              {/* ==================================================
                  네이버 로그인
                 ================================================== */}
              <button
                type="button"
                onClick={onNaverLogin}
                disabled={isBusy}
                className="mx-auto mt-5 flex w-[82%] max-w-[300px] items-center justify-center gap-3 rounded-2xl bg-[#03C75A] px-5 py-3 text-base font-extrabold text-white shadow-lg shadow-emerald-200/70 transition hover:-translate-y-0.5 hover:bg-[#02b852] hover:shadow-xl focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-200 disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-70"
              >
                {/*
                 * 세션 확인 중이거나
                 * 네이버 인증 화면으로 이동 중일 때만
                 * N 로고 대신 로딩 표시를 보여준다.
                 */}
                {checkingSession || isNaverRedirecting ? (
                  <span className="h-7 w-7 animate-spin rounded-full border-[3px] border-white/35 border-t-white" />
                ) : (
                  <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-white/20 text-sm font-black">
                    N
                  </span>
                )}

                <span className="whitespace-nowrap">
                  {checkingSession
                    ? "로그인 확인 중..."
                    : isNaverRedirecting
                      ? "네이버로 이동 중..."
                      : "네이버 로그인"}
                </span>
              </button>

              {/* ==================================================
                  Google 로그인

                  이제 실제 Google OAuth가 연결되어 있으므로
                  기존 disabled 버튼을 정상 로그인 버튼으로 변경한다.
                 ================================================== */}
              <button
                type="button"
                onClick={onGoogleLogin}
                disabled={isBusy}
                className="mx-auto mt-3 flex w-[82%] max-w-[300px] items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-base font-extrabold text-slate-700 shadow-md shadow-slate-200/60 transition hover:-translate-y-0.5 hover:border-slate-300 hover:bg-slate-50 hover:shadow-lg focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-slate-200 disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-70"
              >
                {/*
                 * Google 인증 화면으로 이동 중이면
                 * Google 로고 대신 로딩 표시를 보여준다.
                 */}
                {checkingSession || isGoogleRedirecting ? (
                  <span className="h-7 w-7 animate-spin rounded-full border-[3px] border-slate-200 border-t-blue-500" />
                ) : (
                  <span className="flex h-7 w-7 items-center justify-center">
                    <GoogleLogo />
                  </span>
                )}

                <span className="whitespace-nowrap">
                  {checkingSession
                    ? "로그인 확인 중..."
                    : isGoogleRedirecting
                      ? "Google로 이동 중..."
                      : "Google 로그인"}
                </span>
              </button>

              {/* ==================================================
                  로그인 상태 / 오류 안내
                 ================================================== */}
              {(isBusy || errorMessage) && (
                <p
                  role={errorMessage ? "alert" : undefined}
                  aria-live="polite"
                  className={[
                    "mt-2 text-center text-xs leading-5",
                    errorMessage
                      ? "font-semibold text-rose-600"
                      : "text-slate-400",
                  ].join(" ")}
                >
                  {helperMessage}
                </p>
              )}

              {/* ==================================================
                  Memory Jar 자체 계정 로그인 / 회원가입 - 준비 중
                 ================================================== */}
              <button
                type="button"
                disabled
                aria-label="이메일 로그인과 회원가입 준비 중"
                className="mx-auto mt-2 flex w-[82%] max-w-[300px] cursor-not-allowed items-center justify-between rounded-2xl border border-slate-200 bg-white/75 px-4 py-2.5 text-sm font-bold text-slate-500"
              >
                {/* 이메일 로그인 아이콘 + 이름 */}
                <span className="flex items-center gap-3">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-sm">
                    ✉
                  </span>

                  <span className="text-left leading-4">
                    Memory Jar 전용
                    <br />
                    로그인, 회원가입
                  </span>
                </span>

                {/* 아직 구현 전인 기능이라는 표시 */}
                <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-400">
                  준비 중
                </span>
              </button>

              {/* 이제 Google은 사용할 수 있으므로 전용 계정만 준비 중이라고 안내한다. */}
              <p className="mt-1 text-center text-[11px] leading-5 text-slate-400">
                Memory Jar 전용 계정은 준비하고 있어요.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 저금통 전체 확대 영역 끝 */}
    </div>
  );
}