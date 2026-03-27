// src/pages/Home.js

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import apiClient from "../api/apiClient";

function FeatureItem({ emoji, title, description }) {
  return (
    <div className="rounded-3xl border border-white/60 bg-white/70 p-4 shadow-sm backdrop-blur">
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-100 to-orange-100 text-xl">
        {emoji}
      </div>
      <p className="text-sm font-bold text-slate-800">{title}</p>
      <p className="mt-1 text-sm leading-6 text-slate-500">{description}</p>
    </div>
  );
}

function JarEntryVisual() {
  return (
    <div className="relative mx-auto flex h-[340px] w-[280px] items-center justify-center">
      <div className="absolute inset-8 rounded-full bg-rose-200/60 blur-3xl" />
      <div className="absolute -left-1 top-10 text-2xl">✨</div>
      <div className="absolute right-4 top-14 text-2xl">💛</div>
      <div className="absolute left-6 bottom-16 text-2xl">🌿</div>
      <div className="absolute right-8 bottom-10 text-2xl">💌</div>

      <div className="absolute top-[48px] z-20 h-11 w-40 rounded-full bg-gradient-to-r from-rose-400 to-orange-400 shadow-lg" />
      <div className="absolute top-[61px] z-30 h-2.5 w-16 rounded-full bg-slate-700/80" />

      <div className="relative z-10 mt-8 h-[220px] w-[190px] rounded-[42%_42%_28%_28%] border-4 border-rose-200 bg-gradient-to-b from-rose-100 via-pink-50 to-white shadow-[0_20px_50px_rgba(15,23,42,0.12)]">
        <div className="absolute left-6 top-6 h-24 w-8 rounded-full bg-white/60 blur-sm" />
        <div className="absolute right-8 top-10 h-16 w-4 rounded-full bg-white/50 blur-sm" />

        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
          <div className="text-5xl">🌸</div>

          <div className="rounded-full bg-white/90 px-4 py-2 text-sm font-bold text-slate-700 shadow">
            추억 저금통 입장
          </div>

          <div className="text-center text-xs leading-5 text-slate-500">
            함께 만든 이야기를
            <br />
            차곡차곡 모아보세요
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const navigate = useNavigate();
  const BACKEND = import.meta.env.VITE_API_BASE_URL;

  const [checkingSession, setCheckingSession] = useState(true);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [envError, setEnvError] = useState("");
  const [sessionWarning, setSessionWarning] = useState("");

  useEffect(() => {
    let ignore = false;

    async function checkSession() {
      try {
        const res = await apiClient.get("/api/v1/me");
        const me = res.data?.data;

        if (!ignore && me) {
          navigate("/jars", { replace: true });
          return;
        }
      } catch (e) {
        const status = e?.response?.status;

        // 401/403은 "아직 로그인 안 한 상태"일 수 있으니 조용히 통과
        if (status && status !== 401 && status !== 403 && !ignore) {
          setSessionWarning(
            "로그인 상태를 확인하는 중 서버와 통신이 조금 불안정했어요. 그래도 로그인 버튼은 사용할 수 있어요."
          );
        }
      } finally {
        if (!ignore) {
          setCheckingSession(false);
        }
      }
    }

    checkSession();

    return () => {
      ignore = true;
    };
  }, [navigate]);

  const handleLogin = () => {
    if (!BACKEND) {
      setEnvError("VITE_API_BASE_URL 값이 비어 있어요. 프론트 환경변수를 확인해 주세요.");
      return;
    }

    setEnvError("");
    setIsRedirecting(true);

    window.location.href = `${BACKEND}/oauth2/authorization/naver`;
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-rose-50 via-orange-50 to-white">
      <div className="absolute left-[-80px] top-[-80px] h-64 w-64 rounded-full bg-rose-200/40 blur-3xl" />
      <div className="absolute bottom-[-120px] right-[-40px] h-80 w-80 rounded-full bg-orange-200/40 blur-3xl" />

      <div className="relative mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <span className="rounded-full border border-rose-200 bg-white/80 px-4 py-2 text-xs font-bold tracking-[0.2em] text-rose-500 backdrop-blur">
            MEMORY JAR
          </span>

          {checkingSession && (
            <span className="rounded-full border border-slate-200 bg-white/80 px-4 py-2 text-xs font-semibold text-slate-500 backdrop-blur">
              로그인 상태 확인 중
            </span>
          )}
        </div>

        <div className="grid gap-8 lg:grid-cols-[1.2fr_0.9fr]">
          {/* 왼쪽 소개 영역 */}
          <section className="rounded-[32px] border border-white/70 bg-white/60 p-6 shadow-[0_20px_80px_rgba(15,23,42,0.08)] backdrop-blur sm:p-8 lg:p-10">
            <div className="grid gap-8 lg:grid-cols-[1fr_320px] lg:items-center">
              <div>
                <p className="text-sm font-bold tracking-[0.25em] text-rose-400">
                  ESJH
                </p>

                <h1 className="mt-4 text-4xl font-black leading-tight text-slate-900 sm:text-5xl">
                  우리만의 저금통에
                  <br />
                  추억을 차곡차곡 담아봐요
                </h1>

                <p className="mt-5 max-w-2xl text-base leading-8 text-slate-600 sm:text-lg">
                  혼자 쓰는 메모장이 아니라, 함께 만드는 작은 보관함이에요.
                  소중한 말, 사진, 기다림의 시간을 한곳에 모아두고
                  열리는 순간을 더 특별하게 만들어요.
                </p>

                <div className="mt-8 grid gap-4 sm:grid-cols-3">
                  <FeatureItem
                    emoji="💌"
                    title="추억 저장"
                    description="남기고 싶은 말과 마음을 차곡차곡 담아둘 수 있어요."
                  />
                  <FeatureItem
                    emoji="🔐"
                    title="잠금과 공개"
                    description="열리는 날짜와 공개 방식까지 저금통답게 설정해요."
                  />
                  <FeatureItem
                    emoji="👭"
                    title="함께 참여"
                    description="둘이서도, 친구끼리도, 그룹으로도 함께 모을 수 있어요."
                  />
                </div>

                <div className="mt-8 rounded-3xl border border-rose-100 bg-gradient-to-r from-rose-50 to-orange-50 p-5">
                  <p className="text-sm font-bold text-slate-800">
                    이런 흐름으로 이어져요
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-slate-600">
                    <span className="rounded-full bg-white px-3 py-2 shadow-sm">
                      1. 네이버 로그인
                    </span>
                    <span>→</span>
                    <span className="rounded-full bg-white px-3 py-2 shadow-sm">
                      2. 내 저금통 입장
                    </span>
                    <span>→</span>
                    <span className="rounded-full bg-white px-3 py-2 shadow-sm">
                      3. 함께 추억 쌓기
                    </span>
                  </div>
                </div>
              </div>

              <div>
                <JarEntryVisual />
              </div>
            </div>
          </section>

          {/* 오른쪽 입장 카드 */}
          <aside className="rounded-[32px] border border-rose-100 bg-white p-6 shadow-[0_20px_80px_rgba(15,23,42,0.08)] sm:p-8">
            <div className="mb-6 flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-[22px] bg-gradient-to-br from-rose-400 to-orange-400 text-2xl font-black text-white shadow-md">
                E
              </div>

              <div>
                <p className="text-sm font-bold tracking-[0.2em] text-rose-400">
                  ENTRY CARD
                </p>
                <h2 className="mt-1 text-2xl font-black text-slate-900">
                  저금통 입장하기
                </h2>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-100 bg-slate-50 p-5">
              <p className="text-sm font-bold text-slate-800">
                네이버 계정으로 간편하게 시작해요
              </p>
              <p className="mt-2 text-sm leading-7 text-slate-500">
                로그인은 네이버 인증 페이지에서 안전하게 진행되고,
                인증이 끝나면 다시 이 서비스로 돌아와요.
              </p>
            </div>

            <button
              type="button"
              onClick={handleLogin}
              disabled={checkingSession || isRedirecting}
              className="mt-6 flex w-full items-center justify-center gap-3 rounded-3xl bg-[#03C75A] px-5 py-4 text-base font-extrabold text-white shadow-lg transition hover:translate-y-[-1px] hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-70"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-white text-lg font-black text-[#03C75A]">
                N
              </span>
              {isRedirecting ? "네이버 로그인 페이지로 이동 중..." : "네이버로 로그인"}
            </button>

            <div className="mt-6 space-y-3">
              <div className="rounded-3xl border border-emerald-100 bg-emerald-50 px-4 py-4">
                <p className="text-sm font-bold text-emerald-700">🔒 안전 안내</p>
                <p className="mt-1 text-sm leading-6 text-emerald-700/90">
                  비밀번호를 여기서 직접 입력하지 않고,
                  네이버 인증 화면에서 로그인해요.
                </p>
              </div>

              <div className="rounded-3xl border border-slate-200 bg-white px-4 py-4">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
                  Backend Status
                </p>
                <p className="mt-2 break-all text-sm font-semibold text-slate-700">
                  {BACKEND || "설정 필요"}
                </p>
              </div>

              {sessionWarning && (
                <div className="rounded-3xl border border-amber-200 bg-amber-50 px-4 py-4">
                  <p className="text-sm font-bold text-amber-700">확인 안내</p>
                  <p className="mt-1 text-sm leading-6 text-amber-700/90">
                    {sessionWarning}
                  </p>
                </div>
              )}

              {envError && (
                <div className="rounded-3xl border border-red-200 bg-red-50 px-4 py-4">
                  <p className="text-sm font-bold text-red-600">환경변수 확인 필요</p>
                  <p className="mt-1 text-sm leading-6 text-red-600/90">
                    {envError}
                  </p>
                </div>
              )}
            </div>

            <div className="mt-6 border-t border-slate-100 pt-5">
              <p className="text-xs leading-6 text-slate-400">
                로그인 후에는 내 저금통 목록으로 이동해서
                생성된 저금통을 확인하거나 새 저금통을 만들 수 있어요.
              </p>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}