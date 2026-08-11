/*
 * LoginJarCard 역할
 *
 * 로그인 전 첫 화면 오른쪽에서 네이버 로그인을 시작하는 저금통 컴포넌트야.
 *
 * 기존 프로젝트의 JarVisual과 같은 저금통 비율과 둥근 모양을 사용해.
 * 별도의 SVG 병을 강제로 늘리지 않기 때문에 화면 크기가 달라져도
 * 저금통이 길쭉하게 찌그러지지 않아.
 *
 * 구성:
 * 1. 파란색 저금통 뚜껑
 * 2. 무색 반투명 유리 몸통
 * 3. 햇빛을 받은 듯한 옅은 무지개 테두리
 * 4. 네이버 로그인 버튼
 * 5. 안전한 로그인 안내
 */
export default function LoginJarCard({
  checkingSession,
  isRedirecting,
  errorMessage,
  onLogin,
}) {
  // 로그인 상태를 확인하거나 네이버로 이동 중일 때 버튼을 잠근다.
  const isBusy = checkingSession || isRedirecting;

  // 버튼 아래에 현재 상태에 맞는 문구를 보여준다.
  const helperMessage = errorMessage
    ? errorMessage
    : checkingSession
      ? "로그인 정보를 확인하고 있어요."
      : isRedirecting
        ? "안전한 네이버 인증 화면으로 이동하고 있어요."
        : "네이버 계정으로 간편하게 시작할 수 있어요.";

  return (
    <div className="relative mx-auto h-[550px] w-full max-w-[450px] lg:translate-x-11">
      {/* 저금통 뒤쪽에 퍼지는 은은한 빛 */}
      <div className="pointer-events-none absolute left-1/2 top-20 h-80 w-80 -translate-x-1/2 rounded-full bg-cyan-100/55 blur-3xl" />

      <div className="pointer-events-none absolute bottom-6 right-2 h-44 w-44 rounded-full bg-violet-100/40 blur-3xl" />

      {/* 저금통의 가로·세로 비율을 그대로 유지하면서 전체를 4% 확대한다.
          확대 기준을 위쪽 가운데로 잡아 윗부분은 거의 그대로 두고
          아래쪽이 자연스럽게 더 내려오게 한다. */}
      <div
        className="absolute inset-0"
        style={{
          transform: "scale(1.115)",
          transformOrigin: "top center",
        }}
      >

      {/* ==================================================
          무색 유리 저금통 뚜껑

          몸통처럼 거의 무색으로 표현하고,
          가장자리에만 햇빛을 받은 듯한 옅은 무지개빛을 넣는다.
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
          {/* 쪽지를 넣는 투입구
              파란색 대신 반투명 회색으로 바꿔 무색 뚜껑과 어울리게 한다. */}
          <div className="absolute left-1/2 top-[16px] h-2.5 w-[100px] -translate-x-1/2 rounded-full bg-slate-400/45 shadow-inner" />

          {/* 뚜껑 윗부분에 비치는 흰색 반사광 */}
          <div className="absolute left-8 top-1.5 h-2.5 w-24 rounded-full bg-white/75 blur-[2px]" />

          {/* 뚜껑 아래쪽에 비치는 아주 옅은 민트빛 */}
          <div className="absolute bottom-0 left-1/2 h-3 w-[72%] -translate-x-1/2 rounded-full bg-emerald-100/25 blur-md" />
        </div>
      </div>

      {/* ==================================================
          무색 유리 저금통 몸통의 바깥 테두리

          여러 색이 아주 옅게 섞인 배경에 4px 패딩을 주면
          유리 가장자리에만 무지개빛이 비치는 것처럼 보인다.
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
          {/* 몸통 안쪽의 아주 은은한 색감 */}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/80 via-white/55 to-emerald-50/45" />

          {/* 왼쪽 유리 반사광 */}
          <div className="pointer-events-none absolute left-6 top-14 h-56 w-5 rounded-full bg-white/75 blur-[3px]" />

          {/* 오른쪽 유리 반사광 */}
          <div className="pointer-events-none absolute right-7 top-20 h-32 w-3 rounded-full bg-cyan-50/80 blur-[2px]" />

          {/* 왼쪽에 살짝 비치는 무지개 반사 */}
          <div
            className="pointer-events-none absolute -left-3 top-28 h-52 w-8 rounded-full opacity-35 blur-md"
            style={{
              background:
                "linear-gradient(to bottom, #bae6fd, #ddd6fe, #fbcfe8, #fef3c7, #bbf7d0)",
            }}
          />

          {/* 오른쪽에 살짝 비치는 무지개 반사 */}
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

          <div className="pointer-events-none absolute left-5 bottom-32 text-xl font-light text-violet-300/55">
            ＋
          </div>

          {/* ==================================================
              실제 로그인 콘텐츠

              현재는 네이버 로그인만 실제로 사용할 수 있다.

              Google 로그인과 Memory Jar 자체 이메일 로그인/회원가입은
              아직 구현 전이므로 "준비 중" 상태로만 보여준다.

              사용자가 준비 중인 기능을 눌러 혼란스럽지 않도록
              disabled 버튼으로 만들어 실제 로그인 요청은 발생하지 않는다.
             ================================================== */}
          <div className="relative z-10 flex h-full flex-col px-8 pb-7 pt-12 sm:px-10">

            {/* ==================================================
                Memory Jar 서비스 배지
               ================================================== */}
            <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-emerald-100 bg-white/90 px-3.5 py-2 text-[11px] font-black uppercase tracking-[0.2em] text-emerald-600 shadow-sm">
              {/* 작은 초록색 상태 점 */}
              <span className="h-2 w-2 rounded-full bg-emerald-400" />

              Memory Jar
            </div>


            {/* ==================================================
                로그인 제목
               ================================================== */}
            <h2 className="mt-4 text-center text-[2rem] font-black leading-tight text-slate-900">
              저금통 입장하기
            </h2>


            {/* ==================================================
                로그인 설명

                현재 사용할 수 있는 로그인 방법이 네이버라는 것을
                자연스럽게 안내한다.
               ================================================== */}
            <p className="mt-2 text-center text-sm leading-6 text-slate-500">
              원하는 방법으로 Memory Jar를 시작해보세요.
            </p>


            {/* ==================================================
                네이버 로그인

                현재 실제로 동작하는 로그인 방법이다.
               ================================================== */}
            <button
              type="button"
              onClick={onLogin}
              disabled={isBusy}
              className="mx-auto mt-5 flex w-[82%] max-w-[300px] items-center justify-center gap-3 rounded-2xl bg-[#03C75A] px-5 py-3 text-base font-extrabold text-white shadow-lg shadow-emerald-200/70 transition hover:-translate-y-0.5 hover:bg-[#02b852] hover:shadow-xl focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-200 disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-70"
            >
              {/* 로그인 확인 중이거나 네이버로 이동 중이면 로딩 표시 */}
              {isBusy ? (
                <span className="h-7 w-7 animate-spin rounded-full border-[3px] border-white/35 border-t-white" />
              ) : (
                /* 네이버 N 로고 영역 */
                <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-white/20 text-sm font-black">
                  N
                </span>
              )}

              {/* 현재 로그인 상태에 따라 버튼 문구를 변경한다. */}
              <span className="whitespace-nowrap">
                {checkingSession
                  ? "로그인 확인 중..."
                  : isRedirecting
                    ? "네이버로 이동 중..."
                    : "네이버 로그인"}
              </span>
            </button>


            {/* ==================================================
                현재 로그인 상태 / 오류 안내

                로그인 중이거나 오류가 발생했을 때만
                사용자에게 현재 상황을 알려준다.
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
                로그인 방법 구분선

                위쪽은 현재 사용할 수 있는 네이버 로그인,
                아래쪽은 앞으로 추가될 로그인 방법이다.
               ================================================== */}
            <div className="mx-auto mt-4 flex w-[82%] max-w-[300px] items-center gap-3">
              {/* 왼쪽 선 */}
              <div className="h-px flex-1 bg-slate-200" />

              <span className="text-[11px] font-medium text-slate-400">
                준비 중
              </span>

              {/* 오른쪽 선 */}
              <div className="h-px flex-1 bg-slate-200" />
            </div>


            {/* ==================================================
                Google 로그인 - 준비 중

                아직 실제 OAuth 연결을 하지 않았기 때문에
                버튼을 disabled 상태로 둔다.
               ================================================== */}
            <button
              type="button"
              disabled
              aria-label="Google 로그인 준비 중"
              className="mx-auto mt-3 flex w-[82%] max-w-[300px] cursor-not-allowed items-center justify-between rounded-2xl border border-slate-200 bg-white/75 px-4 py-2.5 text-sm font-bold text-slate-500"
            >
              {/* Google 아이콘 + 로그인 이름 */}
              <span className="flex items-center gap-3">
                <span className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white font-black text-slate-500">
                  G
                </span>

                Google 로그인
              </span>

              {/* 준비 중 표시 */}
              <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-400">
                준비 중
              </span>
            </button>


            {/* ==================================================
                Memory Jar 자체 계정 로그인 / 회원가입 - 준비 중

                나중에 이메일과 비밀번호를 사용하는 자체 계정 기능이
                구현되면 이 버튼을 실제 로그인/회원가입 화면으로 연결할 수 있다.
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
                Memory Jar 전용
                <br /> 로그인, 회원가입
              </span>

              {/* 준비 중 표시 */}
              <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-400">
                준비 중
              </span>
            </button>


            {/* ==================================================
                추가 로그인 기능 안내

                사용자가 "왜 버튼이 안 눌리지?"라고 생각하지 않도록
                아직 개발 중이라는 사실을 한 번 더 알려준다.
               ================================================== */}
            <p className="mt-1 text-center text-[11px] leading-5 text-slate-400">
              Google 로그인과 Memory Jar 전용 계정을
              <br />
              준비하고 있어요.
            </p>

          </div>
          </div>
        </div>
      </div>

      {/* 저금통 전체 확대 영역 끝 */}
    </div>
);
}