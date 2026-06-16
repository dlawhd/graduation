// src/pages/Home.jsx

// ------------------------------------------------------------
// 이 파일은 서비스 첫 화면(랜딩) + 로그인 시작 화면 역할을 해요.
// 이미 로그인된 사용자는 /jars 로 보내고,
// 로그인 전 사용자는 예쁜 소개 화면과 로그인 버튼을 보게 돼요.
// 공통 헤더는 App.jsx 에서 보여주기 때문에,
// 이 파일 안에는 헤더를 따로 만들지 않아요.
// ------------------------------------------------------------

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import apiClient from "../api/apiClient";

// ------------------------------------------------------------
// Home 컴포넌트
// - 첫 화면 전체를 그려주는 컴포넌트
// - 로그인 상태 확인
// - 네이버 로그인 시작
// ------------------------------------------------------------
export default function Home() {
  const navigate = useNavigate();

  // 백엔드 주소
  // 예: https://api.esjh.shop
  const BACKEND = import.meta.env.VITE_API_BASE_URL;

  // 로그인 상태 확인 중인지 저장
  const [checkingSession, setCheckingSession] = useState(true);

  // 네이버 로그인 페이지로 이동 중인지 저장
  const [isRedirecting, setIsRedirecting] = useState(false);

  // 사용자에게 보여줄 에러 문구
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let ignore = false;

    // --------------------------------------------------------
    // 이미 로그인한 사용자인지 확인하는 함수
    // 로그인되어 있으면 굳이 홈을 보여주지 않고 /jars 로 보냄
    // --------------------------------------------------------
    async function checkSession() {
      try {
        const res = await apiClient.get("/api/v1/me", {
          _skipAuthRefresh: true,
        });
        const me = res.data?.data;

        if (!ignore && me) {
          navigate("/jars", { replace: true });
          return;
        }
      } catch (e) {
        const status = e?.response?.status;

        // 401, 403은 "로그인 안 됨"이므로 정상 흐름으로 보고
        // 다른 에러만 짧게 안내 문구를 보여줌
        if (status && status !== 401 && status !== 403 && !ignore) {
          setErrorMessage("지금 서버 확인이 잠깐 불안정해요. 잠시 후 다시 시도해 주세요.");
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

  // --------------------------------------------------------
  // 로그인 버튼 클릭 시 네이버 로그인 시작
  // --------------------------------------------------------
  const handleLogin = () => {
    if (!BACKEND) {
      setErrorMessage("로그인 연결 주소가 아직 설정되지 않았어요. 환경변수를 확인해 주세요.");
      return;
    }

    setErrorMessage("");
    setIsRedirecting(true);

    // 네이버 로그인 시작 주소로 이동
    window.location.href = `${BACKEND}/oauth2/authorization/naver`;
  };

  return (
    // 헤더 높이(h-20 = 80px)를 빼고 화면을 채우도록 계산
    <div className="relative min-h-[calc(100vh-80px)] overflow-hidden bg-[#eef8f5]">
      {/* -------------------------------------------------- */}
      {/* 배경 장식 1: 왼쪽 위 큰 민트 블러 */}
      {/* -------------------------------------------------- */}
      <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-emerald-200/50 blur-3xl" />

      {/* -------------------------------------------------- */}
      {/* 배경 장식 2: 오른쪽 위 하늘색 블러 */}
      {/* -------------------------------------------------- */}
      <div className="pointer-events-none absolute right-0 top-0 h-80 w-80 rounded-full bg-cyan-200/40 blur-3xl" />

      {/* -------------------------------------------------- */}
      {/* 배경 장식 3: 아래쪽 노란빛 블러 */}
      {/* -------------------------------------------------- */}
      <div className="pointer-events-none absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-amber-100/60 blur-3xl" />

      {/* 전체 내용 영역 */}
      <div className="relative z-10 mx-auto flex min-h-[calc(100vh-80px)] w-full max-w-7xl items-center px-6 py-8">
        <div className="grid w-full items-center gap-12 lg:grid-cols-[1.15fr_0.85fr]">
          {/* ==================================================
              왼쪽 소개 영역
             ================================================== */}
          <section className="relative">
            {/* 작은 배지 */}
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white/80 px-4 py-2 text-sm font-bold text-emerald-700 shadow-sm backdrop-blur">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" />
              함께 모으는 추억 저금통
            </div>

            {/* 큰 제목 */}
            <h1 className="max-w-3xl text-4xl font-black leading-tight text-slate-900 sm:text-5xl lg:text-6xl">
              우리만의 저금통에
              <br />
              <span className="bg-gradient-to-r from-emerald-600 via-teal-500 to-cyan-500 bg-clip-text text-transparent">
                추억을 차곡차곡
              </span>
              <br />
              담아봐요
            </h1>

            {/* 설명 */}
            <p className="mt-6 max-w-2xl text-base leading-8 text-slate-600 sm:text-lg">
              혼자 쓰는 메모장이 아니라, 함께 기억을 모으는 공간이에요.
              소중한 말, 사진, 마음을 저금통에 담아두고
              약속한 날이 되면 다시 열어볼 수 있어요.
            </p>

            {/* 기능 카드 3개 */}
            <div className="mt-10 grid gap-4 sm:grid-cols-3">
              <div className="rounded-3xl border border-white/70 bg-white/75 p-5 shadow-lg shadow-emerald-100/50 backdrop-blur">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-2xl">
                  🔐
                </div>
                <h3 className="text-base font-extrabold text-slate-900">안전하게 보관</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  오픈 날짜 전까지 소중한 추억을 조용히 담아둘 수 있어요.
                </p>
              </div>

              <div className="rounded-3xl border border-white/70 bg-white/75 p-5 shadow-lg shadow-cyan-100/50 backdrop-blur">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-100 text-2xl">
                  👨‍👩‍👧‍👦
                </div>
                <h3 className="text-base font-extrabold text-slate-900">함께 쓰는 공간</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  커플, 친구, 가족이 같은 저금통에 추억을 함께 모을 수 있어요.
                </p>
              </div>

              <div className="rounded-3xl border border-white/70 bg-white/75 p-5 shadow-lg shadow-amber-100/50 backdrop-blur">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-2xl">
                  🎁
                </div>
                <h3 className="text-base font-extrabold text-slate-900">특별한 오픈</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  기다리던 날이 오면 숨겨둔 추억을 선물처럼 다시 만나요.
                </p>
              </div>
            </div>

            {/* 아래 작은 강조 문구 */}
            <div className="mt-8 flex flex-wrap gap-3">
              <span className="rounded-full bg-white/85 px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200">
                네이버 간편 로그인
              </span>
              <span className="rounded-full bg-white/85 px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200">
                초대코드로 함께 참여
              </span>
              <span className="rounded-full bg-white/85 px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200">
                오픈일까지 차곡차곡
              </span>
            </div>
          </section>

          {/* ==================================================
              오른쪽 로그인 카드 영역
             ================================================== */}
          <section className="relative flex items-center justify-center">
            {/* 로그인 카드 뒤 장식 */}
            <div className="absolute -right-6 -top-6 h-32 w-32 rounded-full bg-emerald-200/40 blur-2xl" />
            <div className="absolute -bottom-8 -left-4 h-28 w-28 rounded-full bg-cyan-200/40 blur-2xl" />

            {/* 카드 본체 */}
            <div className="relative w-full max-w-md rounded-[32px] border border-white/70 bg-white/80 p-8 shadow-[0_20px_60px_rgba(15,23,42,0.12)] backdrop-blur-xl">
              {/* 상단 작은 아이콘 */}
              <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-[28px] bg-gradient-to-br from-emerald-100 to-teal-100 text-4xl shadow-inner">
                🫙
              </div>

              {/* 카드 제목 */}
              <h2 className="text-center text-3xl font-black text-slate-900">
                저금통 입장하기
              </h2>

              {/* 카드 설명 */}
              <p className="mt-3 text-center text-sm leading-7 text-slate-500">
                네이버 계정으로 간단하게 시작하고,
                <br />
                로그인 후 바로 내 저금통 목록으로 이동해요.
              </p>

              {/* 상태 확인 문구 */}
              {checkingSession && (
                <div className="mt-6 overflow-hidden rounded-3xl border border-emerald-100 bg-gradient-to-r from-emerald-50 via-white to-cyan-50 shadow-sm">
                  <div className="flex items-center gap-4 px-5 py-4">
                    {/* 동그란 로딩 아이콘 */}
                    <div className="relative flex h-11 w-11 shrink-0 items-center justify-center">
                      {/* 바깥쪽 은은한 원 */}
                      <div className="absolute inset-0 rounded-full bg-emerald-200/60 blur-sm" />

                      {/* 돌아가는 테두리 */}
                      <div className="h-11 w-11 animate-spin rounded-full border-[3px] border-emerald-200 border-t-emerald-500" />

                      {/* 가운데 아이콘 */}
                      <div className="absolute flex h-7 w-7 items-center justify-center rounded-full bg-white text-sm shadow-sm">
                        🫙
                      </div>
                    </div>

                    {/* 문구 영역 */}
                    <div className="min-w-0">
                      <p className="text-sm font-extrabold text-slate-800">
                        로그인 정보를 확인하는 중이에요...
                      </p>
                      <p className="mt-1 text-xs leading-5 text-slate-500">
                        잠시만 기다려 주세요. 로그인 상태를 확인한 뒤 알맞은 화면으로 이동할게요.
                      </p>
                    </div>
                  </div>

                  {/* 아래쪽 아주 얇은 진행 느낌 바 */}
                  <div className="h-1 w-full overflow-hidden bg-emerald-100/70">
                    <div className="h-full w-1/3 animate-pulse rounded-full bg-gradient-to-r from-emerald-400 via-teal-400 to-cyan-400" />
                  </div>
                </div>
              )}

              {/* 에러 문구 */}
              {!checkingSession && errorMessage && (
                <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-700">
                  {errorMessage}
                </div>
              )}

              {/* 로그인 버튼 */}
              <button
                type="button"
                onClick={handleLogin}
                disabled={checkingSession || isRedirecting}
                className="mt-7 flex w-full items-center justify-center gap-3 rounded-2xl bg-[#03C75A] px-5 py-4 text-base font-extrabold text-white shadow-lg shadow-emerald-200 transition hover:-translate-y-0.5 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-80"
              >
                {isRedirecting ? (
                  <>
                    {/* 돌아가는 작은 로딩 원 */}
                    <span className="relative flex h-9 w-9 items-center justify-center">
                      <span className="absolute inset-0 rounded-full border-[3px] border-white/30 border-t-white animate-spin" />
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/15 text-[10px] font-black">
                        N
                      </span>
                    </span>

                    {/* 이동 중 문구 */}
                    <span className="flex flex-col items-center text-center leading-tight">
                      <span className="text-sm font-extrabold sm:text-base">
                        네이버 로그인으로 이동 중이에요...
                      </span>
                      <span className="text-[11px] font-medium text-white/80 sm:text-xs">
                        잠시만 기다리면 네이버 인증 화면이 열려요
                      </span>
                    </span>
                  </>
                ) : (
                  <>
                    {/* 기본 상태 아이콘 */}
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/20 text-sm font-black">
                      N
                    </span>

                    {/* 기본 상태 문구 */}
                    <span>네이버로 로그인</span>
                  </>
                )}
              </button>
              {/* 버튼 아래 작은 상태 안내 */}
              <p className="mt-3 text-center text-xs leading-5 text-slate-400">
                {isRedirecting
                  ? "안전한 네이버 인증 화면으로 연결하고 있어요."
                  : "네이버 계정으로 간편하게 시작할 수 있어요."}
              </p>

              {/* 보안 안내 */}
              <div className="mt-6 rounded-2xl bg-gradient-to-r from-emerald-50 to-cyan-50 px-4 py-4 ring-1 ring-emerald-100">
                <p className="text-sm font-extrabold text-slate-800">안전 안내</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  비밀번호를 이 화면에 직접 입력하지 않고,
                  네이버 인증 화면에서 안전하게 로그인해요.
                </p>
              </div>

              {/* 카드 아래 작은 안내 */}
              <p className="mt-5 text-center text-xs leading-6 text-slate-400">
                로그인하면 나의 저금통 목록과 초대받은 공간으로 바로 이동할 수 있어요.
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}