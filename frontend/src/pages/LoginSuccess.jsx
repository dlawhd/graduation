// src/pages/LoginSuccess.jsx

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import apiClient, { fetchCsrf } from "../api/apiClient";
import MemoryJarLogoIcon from "../components/icons/MemoryJarLogoIcon";

/*
 * 로그인 성공 화면에서 완료 문구를 보여주는 최소 시간
 *
 * 인증이 끝나자마자 화면이 사라지면 깜빡이는 것처럼 보일 수 있어서
 * 아주 짧게 완료 상태를 보여준 뒤 목적지로 이동한다.
 */
const SUCCESS_VIEW_DELAY_MS = 2500;

/*
 * 로그인 전에 저장한 이동 주소를 안전하게 꺼내는 함수
 *
 * 서비스 내부 주소(/로 시작하는 주소)만 허용하고,
 * 저장된 주소가 없거나 올바르지 않으면 저금통 목록으로 이동한다.
 */
function getSafeRedirectTarget() {
  const storedTarget = sessionStorage.getItem("postLoginRedirect");

  if (
    !storedTarget ||
    !storedTarget.startsWith("/") ||
    storedTarget.startsWith("//")
  ) {
    return "/jars";
  }

  return storedTarget;
}

/*
 * LoginSuccessJarVisual 역할
 *
 * 로그인 성공 화면 중앙에서 보여주는 브랜드 저금통이야.
 * 기존 헤더에서 사용하는 MemoryJarLogoIcon을 크게 재사용해서
 * 랜딩 화면, 헤더, 로그인 성공 화면의 디자인을 하나로 맞춘다.
 */
function LoginSuccessJarVisual({ phase }) {
  const isDone = phase === "done";
  const isError = phase === "error";

  return (
    <div className="relative mx-auto flex h-64 w-64 items-center justify-center sm:h-72 sm:w-72">
      {/* 저금통 뒤에서 은은하게 퍼지는 빛 */}
      <div
        className={[
          "absolute inset-8 rounded-full blur-3xl motion-safe:animate-pulse",
          isError
            ? "bg-rose-200/65"
            : isDone
              ? "bg-emerald-200/70"
              : "bg-cyan-200/60",
        ].join(" ")}
      />

      {/* 기존 Memory Jar SVG를 크게 보여준다. */}
      <div className="relative z-10 rounded-full bg-white/55 p-4 shadow-[0_24px_70px_rgba(15,23,42,0.12)] ring-1 ring-white/90 backdrop-blur-sm motion-safe:animate-[bounce_2.8s_ease-in-out_infinite]">
        <MemoryJarLogoIcon className="h-40 w-40 sm:h-48 sm:w-48" />
      </div>
    </div>
  );
}

/*
 * LoginSuccess 역할
 *
 * 소셜 로그인 성공 뒤에 필요한 보안 준비와 사용자 확인을 수행하고,
 * 짧은 브랜드 전환 화면을 보여준 뒤 원래 목적지로 이동한다.
 *
 * 사용자에게는 CSRF나 API 경로 같은 개발 정보 대신
 * 현재 준비 중인지, 완료됐는지, 다시 시도가 필요한지만 알려준다.
 */
export default function LoginSuccess() {
  const navigate = useNavigate();

  // checking: 확인 중, done: 확인 완료, error: 확인 실패
  const [phase, setPhase] = useState("checking");

  // 확인된 로그인 사용자 정보
  const [me, setMe] = useState(null);

  // 사용자에게 보여줄 오류 문구
  const [error, setError] = useState("");

  // 화면이 열린 순간 이동할 목적지를 한 번만 결정한다.
  const [redirectTarget] = useState(() => getSafeRedirectTarget());

  useEffect(() => {
    let ignore = false;
    let moveTimer = null;

    async function prepareLogin() {
      try {
        setPhase("checking");
        setError("");

        // 이후 POST/PATCH/DELETE 요청에 사용할 CSRF 토큰을 준비한다.
        await fetchCsrf();

        if (ignore) return;

        // 실제 로그인된 사용자가 맞는지 확인한다.
        const response = await apiClient.get("/api/v1/me");
        const meData = response.data?.data || null;

        if (ignore) return;

        setMe(meData);
        setPhase("done");

        // 목적지 화면에서 한 번만 보여줄 로그인 완료 알림을 저장한다.
        const displayName = meData?.name?.trim();

        /*
         * 목적지 화면에서 보여줄 로그인 완료 알림이다.
         *
         * 신규 가입자와 기존 사용자 모두 어색하지 않도록
         * 로그인 완료 사실만 간단하게 알려준다.
         */
        const toastMessage = displayName
          ? `${displayName}님 로그인됐어요!`
          : "로그인이 완료됐어요!";

        sessionStorage.setItem("loginSuccessToast", toastMessage);

        // 원래 이동 주소를 꺼냈으므로 저장된 값을 정리한다.
        sessionStorage.removeItem("postLoginRedirect");

        // 완료 상태를 아주 잠깐 보여준 뒤 목적지로 이동한다.
        moveTimer = window.setTimeout(() => {
          navigate(redirectTarget, { replace: true });
        }, SUCCESS_VIEW_DELAY_MS);
      } catch (requestError) {
        if (ignore) return;

        const serverMessage =
          requestError?.response?.data?.error?.message ||
          requestError?.response?.data?.message ||
          "로그인 상태를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.";

        setError(serverMessage);
        setPhase("error");

        // 배포 화면에는 복잡한 오류를 노출하지 않고
        // 개발 환경 콘솔에서만 자세한 내용을 확인한다.
        if (import.meta.env.DEV) {
          console.error("로그인 성공 화면 확인 오류", requestError);
        }
      }
    }

    prepareLogin();

    return () => {
      ignore = true;

      if (moveTimer) {
        window.clearTimeout(moveTimer);
      }
    };
  }, [navigate, redirectTarget]);

  // 초대 링크를 통해 로그인했는지 확인한다.
  const isInviteRedirect = redirectTarget.startsWith("/invite/");

/*
 * 현재 로그인 상태에 맞는 제목을 만든다.
 *
 * 신규 가입자와 기존 사용자 모두 자연스럽게 볼 수 있도록
 * "다시 만나서" 대신 공통 환영 문구를 사용한다.
 */
const title =
  phase === "error"
    ? "로그인 확인이 필요해요"
    : phase === "done"
      ? `${me?.name ? `${me.name}님, ` : ""}환영해요!`
      : "추억 저금통을 준비하고 있어요";

  // 현재 상태와 이동 목적지에 맞는 설명을 만든다.
  const description =
    phase === "error"
      ? error
      : phase === "done"
        ? isInviteRedirect
          ? "초대받은 저금통으로 이동하고 있어요."
          : "내 추억 저금통으로 이동하고 있어요."
        : "잠시만 기다려 주세요.";

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-emerald-50 via-cyan-50 to-violet-50 px-4 py-10 sm:px-6">
      {/* 배경에 은은한 색 번짐을 넣어 랜딩 화면과 분위기를 맞춘다. */}
      <div className="pointer-events-none absolute -left-24 -top-24 h-80 w-80 rounded-full bg-emerald-200/40 blur-3xl" />

      <div className="pointer-events-none absolute -bottom-28 -right-20 h-96 w-96 rounded-full bg-violet-200/40 blur-3xl" />

      <div className="pointer-events-none absolute left-1/2 top-1/3 h-72 w-72 -translate-x-1/2 rounded-full bg-cyan-100/50 blur-3xl" />

      <main className="relative z-10 w-full max-w-2xl rounded-[40px] border border-white/80 bg-white/70 px-6 py-8 text-center shadow-[0_28px_90px_rgba(15,23,42,0.12)] backdrop-blur-xl sm:px-12 sm:py-10">
        {/* 브랜드 이름 */}
        <div className="inline-flex items-center gap-3 rounded-full border border-white bg-white/85 px-4 py-2 shadow-sm">
          <MemoryJarLogoIcon className="h-8 w-8" />

          <span className="text-sm font-black uppercase tracking-[0.26em] text-emerald-600">
            Memory Jar
          </span>
        </div>

        {/* 로그인 상태를 표현하는 저금통 SVG */}
        <LoginSuccessJarVisual phase={phase} />

        {/* 로그인 상태에 맞춰 제목과 안내 문구만 간단하게 보여준다. */}
        <h1 className="text-3xl font-black leading-tight text-slate-900 sm:text-4xl">
          {title}
        </h1>

        <p
          className={[
            "mx-auto mt-4 max-w-lg text-base leading-8",
            phase === "error" ? "text-rose-600" : "text-slate-500",
          ].join(" ")}
          role={phase === "error" ? "alert" : "status"}
          aria-live="polite"
        >
          {description}
        </p>

        {/* 확인 중과 완료 상태에서는 작은 점 애니메이션을 보여준다. */}
        {phase !== "error" && (
          <div
            className="mt-7 flex items-center justify-center gap-2"
            aria-hidden="true"
          >
            {[0, 1, 2].map((index) => (
              <span
                key={index}
                className="h-2.5 w-2.5 rounded-full bg-emerald-400 motion-safe:animate-bounce"
                style={{ animationDelay: `${index * 140}ms` }}
              />
            ))}
          </div>
        )}

        {/* 정상 상태에서는 서비스 감성 문구만 짧게 보여준다. */}
        {phase !== "error" && (
          <p className="mt-7 text-sm font-semibold text-slate-400">
            소중한 추억을 차곡차곡 모아볼까요?
          </p>
        )}

        {/* 오류가 발생했을 때만 사용자가 선택할 수 있는 버튼을 보여준다. */}
        {phase === "error" && (
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-2xl bg-emerald-500 px-6 py-3.5 text-sm font-black text-white shadow-lg shadow-emerald-200/70 transition hover:-translate-y-0.5 hover:bg-emerald-600 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-200"
            >
              다시 시도하기
            </button>

            <button
              type="button"
              onClick={() => navigate("/", { replace: true })}
              className="rounded-2xl border border-slate-200 bg-white px-6 py-3.5 text-sm font-black text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-slate-200"
            >
              로그인 화면으로
            </button>
          </div>
        )}
      </main>
    </div>
  );
}