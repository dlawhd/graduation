import { Link } from "react-router-dom";

/** 상세 정보를 열지 못했을 때 목록, 재시도, 도움말로 연결한다. */
export default function JarDetailUnavailable({ status, onRetry }) {
  const [title, description] = status === 404
    ? ["저금통을 찾을 수 없어요", "받은 링크를 다시 확인하거나 내 저금통 목록에서 찾아보세요."]
    : status === 403
      ? ["이 저금통을 열 수 없어요", "참여 중인 계정인지 확인하거나 초대해 준 사람에게 문의해 주세요."]
      : ["저금통 정보를 불러오지 못했어요", "연결 상태를 확인하고 다시 시도해 주세요."];

  return (
    <section aria-labelledby="unavailable-jar-title" className="grid min-h-[calc(100dvh-4rem)] place-items-center bg-[radial-gradient(ellipse_at_50%_34%,#fdfbf1_5%,#f5f2e6_75%)] px-4 py-9 text-center sm:min-h-[calc(100dvh-5rem)] sm:px-6">
      <div className="w-full max-w-2xl">
        <svg viewBox="90 43 380 168" aria-hidden="true" className="mx-auto mb-5 h-auto w-full max-w-[250px] sm:mb-7 sm:max-w-[310px]" fill="none">
          <path d="M126 190v-72a65 65 0 0 1 65-65h175a65 65 0 0 1 65 65v72" fill="#eee5cc" />
          <path d="m156 63 126 127h-72L138 90m120-35 123 135h-28L227 54" fill="#fffaf0" opacity=".6" />
          <rect x="93" y="189" width="375" height="12" rx="6" fill="#aa9474" />
          <ellipse cx="282" cy="188" rx="53" ry="4" fill="#b49d74" opacity=".18" />
          <path d="M264 110v9c-9 4-16 18-16 29v22c0 10 8 17 18 17h28c10 0 18-7 18-17v-22c0-11-7-25-16-29v-9" stroke="#8d9c80" strokeWidth="2" strokeDasharray="4 5" />
          <rect x="256" y="96" width="49" height="14" rx="7" stroke="#8d9c80" strokeWidth="2" strokeDasharray="4 5" />
          <path d="M168 188h27l5-25h-36l4 25Zm13-25v-30m0 12c-13 0-16-7-17-13 8 0 14 4 17 10m0 8c10-1 16-6 16-13-7 0-13 3-16 10" fill="#c3cfab" stroke="#829477" strokeWidth="2" strokeLinejoin="round" />
          <path d="M365 187v-47h14v47m3 0v-65h16v65m2 0 5-56 14 1-5 55" fill="#d2d9bd" stroke="#839477" strokeWidth="2" strokeLinejoin="round" />
        </svg>

        <h1 id="unavailable-jar-title" className="break-keep text-3xl font-black tracking-tight text-[#20372c] sm:text-[42px]">{title}</h1>
        <p className="mx-auto mt-3 max-w-md break-keep text-sm leading-7 text-[#53685c] sm:text-base">{description}</p>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5">
          <Link to="/jars" className="inline-flex min-h-11 items-center rounded-xl bg-emerald-800 px-4 text-sm font-bold text-white transition hover:bg-emerald-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700">
            내 저금통으로
          </Link>
          <button type="button" onClick={onRetry} className="inline-flex min-h-11 items-center rounded-xl border border-[#d8e2d8] bg-white px-4 text-sm font-bold text-[#20372c] transition hover:bg-emerald-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700">
            다시 시도하기
          </button>
        </div>

        {/* 열지 못한 저금통 번호를 문의에 붙이면 권한 확인에서 접수가 막힐 수 있다. */}
        <Link to="/help" className="mt-2 inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold text-emerald-800 underline underline-offset-4 hover:text-emerald-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700">
          도움말 및 문의
        </Link>
      </div>
    </section>
  );
}
