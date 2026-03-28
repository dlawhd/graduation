// src/pages/LoginSuccess.js

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import apiClient, { fetchCsrf } from "../api/apiClient";

function StepItem({ title, description, state }) {
  const isDone = state === "done";
  const isCurrent = state === "current";

  return (
    <div
      className={`rounded-3xl border p-4 transition ${
        isDone
          ? "border-emerald-200 bg-emerald-50"
          : isCurrent
          ? "border-rose-200 bg-rose-50"
          : "border-slate-200 bg-slate-50"
      }`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`mt-0.5 flex h-8 w-8 items-center justify-center rounded-2xl text-sm font-black ${
            isDone
              ? "bg-emerald-500 text-white"
              : isCurrent
              ? "bg-gradient-to-r from-rose-400 to-orange-400 text-white"
              : "bg-white text-slate-400"
          }`}
        >
          {isDone ? "✓" : isCurrent ? "…" : "•"}
        </div>

        <div>
          <p
            className={`text-sm font-bold ${
              isDone || isCurrent ? "text-slate-800" : "text-slate-500"
            }`}
          >
            {title}
          </p>
          <p className="mt-1 text-sm leading-6 text-slate-500">{description}</p>
        </div>
      </div>
    </div>
  );
}

function SuccessJarVisual({ done, error }) {
  return (
    <div className="relative mx-auto flex h-[290px] w-[240px] items-center justify-center">
      <div
        className={`absolute inset-6 rounded-full blur-3xl ${
          error ? "bg-red-200/50" : done ? "bg-emerald-200/50" : "bg-rose-200/60"
        }`}
      />
      <div className="absolute left-4 top-8 text-2xl">✨</div>
      <div className="absolute right-5 top-12 text-2xl">💛</div>
      <div className="absolute right-7 bottom-10 text-2xl">
        {error ? "⚠️" : done ? "🎉" : "⏳"}
      </div>

      <div
        className={`absolute top-[40px] z-20 h-10 w-36 rounded-full shadow-lg ${
          error
            ? "bg-gradient-to-r from-red-400 to-rose-400"
            : done
            ? "bg-gradient-to-r from-emerald-400 to-teal-400"
            : "bg-gradient-to-r from-rose-400 to-orange-400"
        }`}
      />
      <div className="absolute top-[53px] z-30 h-2 w-14 rounded-full bg-slate-700/80" />

      <div
        className={`relative z-10 mt-8 h-[190px] w-[170px] rounded-[42%_42%_28%_28%] border-4 bg-gradient-to-b shadow-[0_20px_50px_rgba(15,23,42,0.12)] ${
          error
            ? "border-red-200 from-red-100 via-rose-50 to-white"
            : done
            ? "border-emerald-200 from-emerald-100 via-teal-50 to-white"
            : "border-rose-200 from-rose-100 via-pink-50 to-white"
        }`}
      >
        <div className="absolute left-5 top-5 h-20 w-7 rounded-full bg-white/60 blur-sm" />
        <div className="absolute right-7 top-8 h-14 w-4 rounded-full bg-white/40 blur-sm" />

        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
          <div className="text-5xl">{error ? "😵" : done ? "🎉" : "🌸"}</div>
          <div className="rounded-full bg-white/90 px-4 py-2 text-sm font-bold text-slate-700 shadow">
            {error ? "확인 필요" : done ? "입장 준비 완료" : "입장 준비 중"}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginSuccess() {
  const navigate = useNavigate();

  const [phase, setPhase] = useState("csrf");
  const [error, setError] = useState("");
  const [me, setMe] = useState(null);

  useEffect(() => {
    let ignore = false;
    let moveTimer = null;

    async function init() {
      try {
        setPhase("csrf");
        await fetchCsrf();

        if (ignore) return;

        setPhase("me");
        const res = await apiClient.get("/api/v1/me");
        const meData = res.data?.data || null;

        if (ignore) return;

        setMe(meData);
        setPhase("done");

        moveTimer = window.setTimeout(() => {
          // 로그인 전에 저장해둔 "원래 가려던 주소"가 있으면 그쪽으로 먼저 보내기
          const redirectTarget = sessionStorage.getItem("postLoginRedirect");

          if (redirectTarget) {
            sessionStorage.removeItem("postLoginRedirect");
            navigate(redirectTarget, { replace: true });
            return;
          }

          // 없으면 기존처럼 저금통 목록으로 이동
          navigate("/jars", { replace: true });
        }, 1100);
      } catch (e) {
        if (ignore) return;

        const serverMessage =
          e?.response?.data?.error?.message ||
          e?.response?.data?.message ||
          e?.message ||
          "로그인 확인 중 문제가 생겼어요.";

        setError(serverMessage);
        setPhase("error");
      }
    }

    init();

    return () => {
      ignore = true;
      if (moveTimer) {
        window.clearTimeout(moveTimer);
      }
    };
  }, [navigate]);

  const progressWidth = useMemo(() => {
    if (phase === "csrf") return "33%";
    if (phase === "me") return "72%";
    if (phase === "done") return "100%";
    if (phase === "error") return "100%";
    return "0%";
  }, [phase]);

  const stepState = (step) => {
    if (phase === "error") {
      if (step === "csrf") return "done";
      if (step === "me") return "done";
      return "current";
    }

    if (phase === "csrf") {
      if (step === "csrf") return "current";
      return "todo";
    }

    if (phase === "me") {
      if (step === "csrf") return "done";
      if (step === "me") return "current";
      return "todo";
    }

    if (phase === "done") {
      return "done";
    }

    return "todo";
  };

  const title = error
    ? "입장 확인 중 잠시 멈췄어요"
    : phase === "done"
    ? `${me?.name ? `${me.name}님, ` : ""}저금통으로 들어갈 준비가 끝났어요`
    : "저금통으로 들어갈 준비를 하고 있어요";

  const description = error
    ? "아래 안내를 확인한 뒤 다시 시도하면 돼요."
    : phase === "done"
    ? "보안 확인과 내 계정 확인이 끝나서 저금통 목록으로 이동하고 있어요."
    : "로그인 직후 필요한 보안 준비와 내 정보 확인을 순서대로 진행 중이에요.";

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-rose-50 via-orange-50 to-white">
      <div className="absolute left-[-100px] top-[-80px] h-72 w-72 rounded-full bg-rose-200/40 blur-3xl" />
      <div className="absolute bottom-[-120px] right-[-60px] h-80 w-80 rounded-full bg-orange-200/40 blur-3xl" />

      <div className="relative mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-6">
          <span className="rounded-full border border-rose-200 bg-white/80 px-4 py-2 text-xs font-bold tracking-[0.2em] text-rose-500 backdrop-blur">
            LOGIN SUCCESS FLOW
          </span>
        </div>

        <div className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr]">
          {/* 왼쪽 감성 영역 */}
          <section className="rounded-[32px] border border-white/70 bg-white/60 p-6 shadow-[0_20px_80px_rgba(15,23,42,0.08)] backdrop-blur sm:p-8">
            <div className="flex h-full flex-col justify-between">
              <div>
                <p className="text-sm font-bold tracking-[0.25em] text-rose-400">
                  ENTRY STATUS
                </p>

                <h1 className="mt-4 text-3xl font-black leading-tight text-slate-900 sm:text-4xl">
                  {title}
                </h1>

                <p className="mt-4 text-base leading-8 text-slate-600">
                  {description}
                </p>
              </div>

              <div className="mt-8">
                <SuccessJarVisual done={phase === "done"} error={!!error} />
              </div>

              <div className="mt-8 rounded-3xl border border-slate-100 bg-white/80 p-5">
                <p className="text-sm font-bold text-slate-800">
                  지금 이 화면에서 하는 일
                </p>
                <p className="mt-2 text-sm leading-7 text-slate-500">
                  로그인 직후에는 바로 이동하는 대신,
                  보안용 CSRF 토큰을 받고 실제 로그인된 사용자 정보까지 확인해요.
                  그래서 이후의 작성, 수정, 삭제 기능이 더 안정적으로 동작해요.
                </p>
              </div>
            </div>
          </section>

          {/* 오른쪽 진행 카드 */}
          <aside className="rounded-[32px] border border-rose-100 bg-white p-6 shadow-[0_20px_80px_rgba(15,23,42,0.08)] sm:p-8">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-bold tracking-[0.2em] text-rose-400">
                  PREPARING
                </p>
                <h2 className="mt-1 text-2xl font-black text-slate-900">
                  입장 준비 상태
                </h2>
              </div>

              <div
                className={`rounded-full px-4 py-2 text-xs font-bold ${
                  error
                    ? "bg-red-100 text-red-600"
                    : phase === "done"
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-rose-100 text-rose-500"
                }`}
              >
                {error ? "확인 필요" : phase === "done" ? "완료" : "진행 중"}
              </div>
            </div>

            <div className="mt-6 h-3 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  error
                    ? "bg-gradient-to-r from-red-400 to-rose-400"
                    : phase === "done"
                    ? "bg-gradient-to-r from-emerald-400 to-teal-400"
                    : "bg-gradient-to-r from-rose-400 to-orange-400"
                }`}
                style={{ width: progressWidth }}
              />
            </div>

            <div className="mt-6 space-y-4">
              <StepItem
                title="보안 준비"
                description="CSRF 토큰을 먼저 받아서 이후 요청을 안전하게 준비해요."
                state={stepState("csrf")}
              />
              <StepItem
                title="내 계정 확인"
                description="지금 로그인된 사용자가 맞는지 /api/v1/me 로 확인해요."
                state={stepState("me")}
              />
              <StepItem
                title="저금통 입장"
                description="확인이 끝나면 저금통 목록 화면으로 자연스럽게 이동해요."
                state={stepState("move")}
              />
            </div>

            {!error && me && (
              <div className="mt-6 rounded-3xl border border-emerald-100 bg-emerald-50 p-5">
                <p className="text-sm font-bold text-emerald-700">
                  확인된 사용자
                </p>
                <p className="mt-2 text-lg font-black text-slate-900">
                  {me.name || "이름 없음"}
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  {me.email || "이메일 정보 없음"}
                </p>
              </div>
            )}

            {error && (
              <div className="mt-6 rounded-3xl border border-red-200 bg-red-50 p-5">
                <p className="text-sm font-bold text-red-600">에러 안내</p>
                <p className="mt-2 text-sm leading-7 text-red-600/90">{error}</p>

                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => window.location.reload()}
                    className="rounded-2xl bg-gradient-to-r from-rose-400 to-orange-400 px-5 py-3 text-sm font-bold text-white shadow-md transition hover:scale-[1.02]"
                  >
                    다시 시도하기
                  </button>

                  <button
                    type="button"
                    onClick={() => navigate("/", { replace: true })}
                    className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
                  >
                    로그인 화면으로
                  </button>
                </div>
              </div>
            )}

            {!error && (
              <div className="mt-6 rounded-3xl border border-slate-100 bg-slate-50 p-5">
                <p className="text-sm font-bold text-slate-800">
                  거의 다 됐어요
                </p>
                <p className="mt-2 text-sm leading-7 text-slate-500">
                  준비가 끝나면 자동으로 저금통 목록으로 이동해요.
                  잠깐만 화면이 보여도 정상 동작이니까 걱정하지 않아도 돼요.
                </p>
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}